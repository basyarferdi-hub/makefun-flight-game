// The chase camera for Kestrel Skies. It trails behind and above the tail,
// lagging gently so the plane moves inside the frame when it manoeuvres,
// widens its view a touch with speed, and never rolls with the plane —
// the horizon stays honest, which is what keeps the pilot oriented.
import { forwardVector } from './aircraft.js';

const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 9, 132);
    this.fov = 62;
    this.shakePhase = 0;
  }

  // Places the camera exactly on the chase spot (used when a sortie starts
  // and when a screenshot scene is staged, so there is no swooping intro).
  snap(state) {
    forwardVector(state, _fwd);
    this.pos.copy(state.pos).addScaledVector(_fwd, -13.5);
    this.pos.y = state.pos.y + 4.4;
    this.camera.position.copy(this.pos);
    _look.copy(state.pos).addScaledVector(_fwd, 16);
    _look.y += 1.2;
    this.camera.lookAt(_look);
  }

  update(state, dt, t) {
    forwardVector(state, _fwd);
    _desired.copy(state.pos).addScaledVector(_fwd, -13.5);
    _desired.y = state.pos.y + 4.4;
    const k = 1 - Math.exp(-3.4 * dt);
    this.pos.lerp(_desired, k);

    // A shudder runs through the airframe in the stall or when it is hurt.
    this.shakePhase += dt * 41;
    const shake = state.stalled ? 0.14 : state.hull < 35 ? 0.07 : 0;
    this.camera.position.copy(this.pos);
    if (shake > 0) {
      this.camera.position.x += Math.sin(this.shakePhase) * shake;
      this.camera.position.y += Math.cos(this.shakePhase * 1.3) * shake;
    }
    _look.copy(state.pos).addScaledVector(_fwd, 16);
    _look.y += 1.2;
    this.camera.lookAt(_look);

    const targetFov = 62 + state.speed * 0.13;
    if (Math.abs(targetFov - this.fov) > 0.05) {
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 2.5);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
