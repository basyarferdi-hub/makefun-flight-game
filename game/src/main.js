// Kestrel Skies — boot, game loop and state machine.
// Modes: menu (the parked Kestrel on the strip, sortie cards up), flying,
// and ended (the sortie card). A ?shot=<scene> query stages a frozen moment
// of the real game for the maker's screenshots; it changes nothing else.
import { buildWorld } from './terrain.js';
import {
  buildAircraft, createFlightState, resetFlight, stepFlight, syncAircraftMesh,
} from './aircraft.js';
import { Course, SORTIES } from './course.js';
import { Hud } from './hud.js';
import { ChaseCamera } from './camera.js';
import { SoundEngine } from './audio.js';
import { installInput, keys, onRestart } from './input.js';

const params = new URLSearchParams(location.search);
const shotScene = params.get('shot');

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 7000);
camera.position.set(14, 6, 130);

const { sun } = buildWorld(scene);
const { group: planeMesh, prop } = buildAircraft();
scene.add(planeMesh);

const state = createFlightState();
const course = new Course(scene);
const hud = new Hud();
const chase = new ChaseCamera(camera);
const sound = new SoundEngine();

let mode = 'menu';
let currentSortie = 0;
let pendingLanding = null;
let pendingTime = 0;
let shotFrames = 0;

installInput();
window.addEventListener('pointerdown', () => sound.unlock(), { once: false });
window.addEventListener('keydown', () => sound.unlock(), { once: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function parkOnStrip() {
  resetFlight(state, { x: 0, y: 1.35, z: 62, yaw: 0.1, speed: 0, throttle: 0, fuel: 100, onGround: true });
}

function startSortie(index) {
  currentSortie = index;
  const sortie = SORTIES[index];
  resetFlight(state, sortie.start);
  course.build(sortie);
  pendingLanding = null;
  document.getElementById('menu').classList.add('hidden');
  hud.hideEnd();
  hud.show();
  mode = 'flying';
  chase.snap(state);
  hud.flash(sortie.name, 1.8);
}

function backToMenu() {
  course.clear();
  parkOnStrip();
  hud.hide();
  hud.hideEnd();
  document.getElementById('menu').classList.remove('hidden');
  mode = 'menu';
}

function finishSortie(landingEvent) {
  const result = course.gradeLanding(state, landingEvent);
  if (landingEvent.type === 'landed') sound.touchdownThud();
  if (result.won) sound.fanfare();
  hud.showEnd(result);
  mode = 'ended';
}

document.querySelectorAll('.sortie').forEach((button) => {
  button.addEventListener('click', () => startSortie(Number(button.dataset.sortie)));
});
document.getElementById('again').addEventListener('click', backToMenu);
onRestart(() => {
  if (mode === 'flying' || mode === 'ended') startSortie(currentSortie);
});

// ---- Screenshot staging ----------------------------------------------------
// Each scene poses the real game — same world, same plane, same HUD — at a
// moment a player could reach, then flags readiness for the capture tool.
function stageShot(name) {
  const sortie = SORTIES[0];
  document.getElementById('menu').classList.add('hidden');
  hud.show();
  if (name === 'menu') {
    parkOnStrip();
    document.getElementById('menu').classList.remove('hidden');
    hud.hide();
    camera.position.set(11.5, 3.1, 36);
    camera.lookAt(0, 2.2, 62);
    mode = 'shot';
    return;
  }
  course.build(sortie);
  resetFlight(state, { ...sortie.start, onGround: false });
  if (name === 'rings') {
    state.pos.set(14, 33, -408);
    state.yaw = Math.atan2(-(36 - 14), -(-480 + 408));
    state.pitch = -0.03; state.roll = 0.16;
    state.speed = 39; state.throttle = 0.72; state.fuel = 78;
    course.setPassed(2); course.elapsed = 83; course.score = 500;
  } else if (name === 'approach') {
    state.pos.set(2.5, 21, 318);
    state.yaw = 0; state.pitch = -0.055; state.roll = 0.02;
    state.speed = 25; state.throttle = 0.3; state.fuel = 41;
    course.setPassed(8); course.elapsed = 231; course.score = 2000;
  } else if (name === 'bank') {
    const summit = SORTIES[1];
    course.build(summit);
    state.pos.set(-120, 88, -760);
    state.yaw = 2.25; state.pitch = 0.04; state.roll = 0.62;
    state.speed = 45; state.throttle = 0.8; state.fuel = 63;
    course.setPassed(2); course.elapsed = 121; course.score = 500;
  }
  chase.snap(state);
  chase.update(state, 0.35, 1);
  hud.update(state, course, 0);
  mode = 'shot';
}

if (shotScene) stageShot(shotScene);
else parkOnStrip();

// ---- Main loop ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (mode === 'flying') {
    const event = stepFlight(state, keys, dt);
    if (event) {
      if (event.type === 'tookOff') {
        if (pendingLanding) { pendingLanding = null; hud.flash('GOING AROUND', 1.2); }
        else hud.flash('AIRBORNE', 1.1);
      } else if (event.type === 'crashed') {
        finishSortie(event);
      } else if (event.type === 'landed' || event.type === 'roughLanding') {
        pendingLanding = event;         // grade once she has rolled to a stop
        pendingTime = 0;
        if (event.type === 'landed') sound.touchdownThud();
      }
    }
    if (mode === 'flying') {
      if (pendingLanding) {
        pendingTime += dt;
        if (state.speed < 0.6 || pendingTime > 8) {
          const ev = pendingLanding;
          pendingLanding = null;
          finishSortie(ev);
        }
      } else if (course.update(state, dt) === 'ring') {
        hud.flash(`RING ${course.passed}/${course.totalRings} · +250`, 1.3);
        sound.ringChime();
      }
      chase.update(state, dt, t);
      sound.update(state.throttle, state.speed * 1.944, state.stalled, dt);
      hud.update(state, course, dt);
    }
  } else if (mode === 'menu') {
    const a = t * 0.07;
    camera.position.set(Math.sin(a) * 17, 4.6 + Math.sin(t * 0.3) * 0.5, 62 + Math.cos(a) * 17);
    camera.lookAt(0, 1.8, 62);
  } else if (mode === 'ended') {
    chase.update(state, dt, t);
    hud.update(state, course, dt);
  } else if (mode === 'shot') {
    shotFrames++;
    if (shotScene === 'rings' || shotScene === 'approach' || shotScene === 'bank') {
      chase.update(state, 0.016, shotFrames * 0.016);
      hud.update(state, course, 0);
    }
    if (shotFrames === 8) window.__shotReady = true;
  }

  // Keep the sun (and its shadow box) travelling with the plane.
  sun.position.set(state.pos.x + 300, state.pos.y + 430, state.pos.z - 230);
  sun.target.position.copy(state.pos);

  syncAircraftMesh(planeMesh, prop, state);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
