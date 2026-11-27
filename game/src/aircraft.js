// The Kestrel: a fabric-and-tube bush plane built from primitives, and the
// flight model that flies it. The model is deliberately honest arcade physics:
// throttle and pitch trade against drag and gravity, turns come from bank,
// the wing stalls below its speed (faster in a bank), and every landing is
// graded by sink rate, speed, bank and where the wheels actually touch.
import { RUNWAY, terrainHeight } from './terrain.js';

export const STALL_SPEED = 17;          // m/s, wings level
export const MAX_SPEED = 78;            // m/s, downhill with everything open

export function createFlightState() {
  return {
    pos: new THREE.Vector3(0, 1.35, 96),
    yaw: 0, pitch: 0, roll: 0,
    speed: 0, vy: 0, throttle: 0,
    fuel: 100, hull: 100,
    onGround: true, stalled: false, dead: false, landed: false,
    propAngle: 0,
  };
}

export function resetFlight(state, start) {
  state.pos.set(start.x, start.y, start.z);
  state.yaw = start.yaw || 0;
  state.pitch = 0; state.roll = 0;
  state.speed = start.speed || 0;
  state.vy = 0;
  state.throttle = start.throttle || 0;
  state.fuel = start.fuel;
  state.hull = 100;
  state.onGround = start.onGround !== false;
  state.stalled = false; state.dead = false; state.landed = false;
}

export function forwardVector(state, out) {
  const cp = Math.cos(state.pitch);
  out.set(-Math.sin(state.yaw) * cp, Math.sin(state.pitch), -Math.cos(state.yaw) * cp);
  return out;
}

export function headingDegrees(state) {
  const deg = (-state.yaw * 180 / Math.PI) % 360;
  return (deg + 360) % 360;
}

// Advances the flight model. Returns an event object when something notable
// happens (tookOff / touchedDown / crashed), otherwise null.
export function stepFlight(state, keys, dt) {
  if (state.dead || state.landed) return null;
  let event = null;

  // Throttle and fuel.
  if (keys.throttleUp) state.throttle = Math.min(1, state.throttle + 0.55 * dt);
  if (keys.throttleDown) state.throttle = Math.max(0, state.throttle - 0.7 * dt);
  const power = state.fuel > 0 ? state.throttle : 0;
  if (!state.onGround || state.speed > 1) {
    state.fuel = Math.max(0, state.fuel - power * dt * 0.42);
  }

  // Attitude: control authority fades as the airspeed drops.
  const authority = Math.min(1, Math.max(0.22, state.speed / 26));
  const pitchRate = 0.62 * authority;
  if (keys.pitchUp) state.pitch += pitchRate * dt;
  if (keys.pitchDown) state.pitch -= pitchRate * dt;
  state.pitch = Math.min(0.55, Math.max(-0.42, state.pitch));
  if (state.onGround) state.pitch = Math.max(0, Math.min(0.2, state.pitch));

  const rollTarget = keys.bankLeft ? -0.95 : keys.bankRight ? 0.95 : 0;
  state.roll += (rollTarget - state.roll) * Math.min(1, dt * 3.1);

  // Turning comes from the bank; the rudder only helps.
  const turnRate = -9.81 * Math.tan(state.roll) / Math.max(state.speed, 13) * 0.92;
  let yawRate = state.onGround ? 0 : turnRate;
  if (keys.rudderLeft) yawRate += 0.3 * authority;
  if (keys.rudderRight) yawRate -= 0.3 * authority;
  if (state.onGround && state.speed > 2) {
    if (keys.rudderLeft) yawRate += 0.25;
    if (keys.rudderRight) yawRate -= 0.25;
    if (keys.bankLeft) yawRate += 0.1;
    if (keys.bankRight) yawRate -= 0.1;
  }
  state.yaw += yawRate * dt;

  // Airspeed: thrust against drag, gravity along the flight path, brakes.
  let accel = power * 11.5
    - 0.0038 * state.speed * state.speed
    - 9.81 * Math.sin(state.pitch) * 0.85
    - Math.abs(state.roll) * 0.55;
  if (state.onGround) {
    accel -= 0.5;
    if (keys.brake) accel -= 13;
  }
  state.speed = Math.min(MAX_SPEED, Math.max(0, state.speed + accel * dt));

  // Vertical speed: the wing carries the plane while it is above the stall.
  const stallSpeed = STALL_SPEED / Math.sqrt(Math.max(0.35, Math.cos(state.roll)));
  state.stalled = !state.onGround && state.speed < stallSpeed;
  let targetVy = Math.sin(state.pitch) * state.speed;
  if (state.stalled) targetVy -= (stallSpeed - state.speed) * 0.95;
  targetVy -= (1 - Math.cos(state.roll)) * Math.abs(state.speed) * 0.07;
  state.vy += (targetVy - state.vy) * Math.min(1, dt * 2.4);

  // Move.
  const fwd = forwardVector(state, _fwd);
  state.pos.addScaledVector(fwd, state.speed * dt);
  if (!state.onGround) state.pos.y += state.vy * dt;
  state.propAngle += (1.5 + power * 46 + state.speed * 0.25) * dt;

  // Ground contact.
  const groundY = terrainHeight(state.pos.x, state.pos.z);
  const gearH = 1.35;
  if (state.pos.y <= groundY + gearH) {
    if (!state.onGround) {
      event = evaluateTouchdown(state, groundY);
      if (event.type === 'crashed') { state.dead = true; return event; }
      state.onGround = true;
    }
    state.pos.y = groundY + gearH;
    state.vy = 0;
    if (state.speed > 23 && state.pitch > 0.1) {
      state.onGround = false;
      state.pos.y += 0.4;
      return { type: 'tookOff' };
    }
  } else if (state.pos.y > groundY + gearH + 0.6) {
    state.onGround = false;
  }
  return event;
}

const _fwd = new THREE.Vector3();

function evaluateTouchdown(state, groundY) {
  const onRunway = Math.abs(state.pos.x) <= RUNWAY.halfWidth + 2
    && state.pos.z >= RUNWAY.zMin - 4 && state.pos.z <= RUNWAY.zMax + 4;
  const sink = state.vy;
  const bank = Math.abs(state.roll);
  const info = { onRunway, sink, speed: state.speed, z: state.pos.z };

  if (onRunway && sink > -5.2 && state.speed < 37 && bank < 0.24) {
    const firm = sink < -3.4;
    if (firm) state.hull = Math.max(0, state.hull - 6);
    return { type: 'landed', firm, ...info };
  }
  if (sink > -2.6 && state.speed < 27 && bank < 0.3 && groundY < 40) {
    state.hull = Math.max(0, state.hull - 16);
    return { type: 'roughLanding', ...info };
  }
  const damage = Math.min(100, 34 + Math.max(0, -sink - 3) * 7 + Math.max(0, state.speed - 26) * 0.9);
  state.hull = Math.max(0, state.hull - damage);
  return { type: 'crashed', ...info };
}

// ---- The model ------------------------------------------------------------

export function buildAircraft() {
  const group = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2ede0 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc23b2a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f33 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 90, transparent: true, opacity: 0.75 });

  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Fuselage: a capsule nose-to-tail (nose toward -Z), red cowling in front.
  const fuselage = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.82, 3.4, 4, 10), cream), 0, 0, 0.4);
  fuselage.rotation.x = Math.PI / 2;
  const cowl = add(new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.8, 1.1, 12), red), 0, 0, -1.95);
  cowl.rotation.x = Math.PI / 2;
  const spinner = add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), red), 0, 0, -2.8);
  spinner.rotation.x = -Math.PI / 2;

  // Propeller: two blades and a faint blur disc that the spin shows through.
  const prop = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.05), dark);
  blade.castShadow = true;
  prop.add(blade);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.38, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.13, side: THREE.DoubleSide }));
  prop.add(disc);
  prop.position.set(0, 0, -2.55);
  group.add(prop);

  // Wing: white centre, red tips, on top of the cabin like a proper bush plane.
  add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 1.65), cream), 0, 0.92, -0.35);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.17, 1.65), red), -3.85, 0.92, -0.35);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.17, 1.65), red), 3.85, 0.92, -0.35);
  // Struts down to the fuselage.
  for (const side of [-1, 1]) {
    const strut = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), dark), side * 1.7, 0.35, -0.35);
    strut.rotation.z = side * 0.6;
  }

  // Cockpit glass and the pilot's head inside it.
  const canopy = add(new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), glass), 0, 0.62, -0.15);
  canopy.scale.set(0.92, 0.78, 1.5);
  const pilot = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a5a34 })), 0, 0.52, 0.25);

  // Tail: red fin and stabiliser.
  const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.1), red), 0, 0.72, 2.95);
  fin.rotation.x = -0.25;
  add(new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.13, 1.0), red), 0, 0.28, 3.05);

  // Fixed gear: two sprung legs, fat tundra tyres and a tail wheel.
  for (const side of [-1, 1]) {
    const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6), dark), side * 0.85, -0.85, -0.9);
    leg.rotation.z = side * 0.35;
    const wheel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 14), dark), side * 1.12, -1.35, -0.9);
    wheel.rotation.z = Math.PI / 2;
  }
  const tailWheel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), dark), 0, -0.72, 3.1);
  tailWheel.rotation.z = Math.PI / 2;

  group.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
  return { group, prop };
}

// Poses the model from the flight state. Chase-view friendly: the plane sits
// at state.pos with gear height already included in the state's ground clamp.
export function syncAircraftMesh(mesh, prop, state) {
  mesh.position.copy(state.pos);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = state.yaw;
  mesh.rotation.x = state.onGround ? Math.max(0, state.pitch) * 0.6 : state.pitch;
  mesh.rotation.z = -state.roll;
  prop.rotation.z = state.propAngle;
}
