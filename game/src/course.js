// Sorties and scoring for Kestrel Skies. A sortie is a set of glowing rings to
// thread in order and a landing to finish. Rings reward precision flying,
// the landing rewards discipline: slow, flat, on the strip, stopped in time.
export const SORTIES = [
  {
    name: 'SORTIE 1 · RING RUN',
    objective: 'Fly through every ring down the valley, then land on the strip.',
    parSeconds: 260,
    start: { x: 0, y: 1.35, z: 96, yaw: 0, speed: 0, throttle: 0, fuel: 100, onGround: true },
    rings: [
      [0, 26, -80], [-42, 34, -280], [36, 30, -480], [-16, 44, -700],
      [62, 38, -950], [-72, 52, -1200], [22, 46, -1480], [0, 30, -1740],
    ],
  },
  {
    name: 'SORTIE 2 · SUMMIT CIRCUIT',
    objective: 'Six rings climbing around the peaks. Watch the stall in the turns.',
    parSeconds: 330,
    start: { x: 0, y: 1.35, z: 96, yaw: 0, speed: 0, throttle: 0, fuel: 100, onGround: true },
    rings: [
      [150, 58, -320], [330, 108, -660], [185, 148, -1060],
      [-165, 138, -1260], [-335, 92, -810], [-120, 52, -360],
    ],
  },
  {
    name: 'SORTIE 3 · SHORT FIELD',
    objective: 'One low ring over the river, then stop on the strip before the hangar line.',
    parSeconds: 240,
    stopZoneZ: 30,
    start: { x: 0, y: 1.35, z: 96, yaw: 0, speed: 0, throttle: 0, fuel: 70, onGround: true },
    rings: [[-265, 24, -320]],
  },
];

const RING_RADIUS = 11;

export class Course {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.sortie = null;
    this.ringMeshes = [];
    this.passed = 0;
    this.score = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  build(sortie) {
    this.clear();
    this.sortie = sortie;
    this.passed = 0;
    this.score = 0;
    this.elapsed = 0;
    this.finished = false;
    this.group = new THREE.Group();
    const gold = new THREE.MeshBasicMaterial({ color: 0xffc93c, side: THREE.DoubleSide });
    const teal = new THREE.MeshBasicMaterial({ color: 0x39d0d8, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    this.ringMeshes = sortie.rings.map(([x, y, z], i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 0.55, 10, 36), i === 0 ? gold : teal);
      ring.position.set(x, y, z);
      // Face each ring along the line of flight that reaches it.
      const prev = i === 0 ? [sortie.start.x, 24, sortie.start.z] : sortie.rings[i - 1];
      ring.lookAt(prev[0], prev[1], prev[2]);
      this.group.add(ring);
      return ring;
    });
    this.scene.add(this.group);
  }

  clear() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group = null;
    }
    this.ringMeshes = [];
  }

  get totalRings() { return this.sortie ? this.sortie.rings.length : 0; }
  get allRingsPassed() { return this.passed >= this.totalRings; }

  // For staged screenshots: pretend the first n rings are already flown.
  setPassed(n) {
    this.passed = n;
    this.refreshRingMaterials();
  }

  refreshRingMaterials() {
    const gold = new THREE.MeshBasicMaterial({ color: 0xffc93c, side: THREE.DoubleSide });
    const teal = new THREE.MeshBasicMaterial({ color: 0x39d0d8, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const done = new THREE.MeshBasicMaterial({ color: 0x53e08a, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    this.ringMeshes.forEach((ring, i) => {
      ring.material = i < this.passed ? done : i === this.passed ? gold : teal;
    });
  }

  // Advances the clock, pulses the next ring and watches for a pass.
  // Returns 'ring' when the next ring is threaded.
  update(state, dt) {
    if (!this.sortie || this.finished) return null;
    this.elapsed += dt;
    const next = this.ringMeshes[this.passed];
    if (next) {
      const pulse = 1 + Math.sin(this.elapsed * 4.2) * 0.05;
      next.scale.setScalar(pulse);
      if (state.pos.distanceTo(next.position) < RING_RADIUS - 0.5) {
        this.passed++;
        this.score += 250;
        this.refreshRingMaterials();
        return 'ring';
      }
    }
    return null;
  }

  // Grades the sortie once the wheels are down (or the plane is not).
  // landingEvent comes from the flight model: landed / roughLanding / crashed.
  gradeLanding(state, landingEvent) {
    this.finished = true;
    const s = this.sortie;
    if (landingEvent.type === 'crashed') {
      return {
        title: 'CRASHED',
        detail: `The Kestrel is down in the valley with ${this.passed} of ${this.totalRings} rings flown. `
          + `Sink ${Math.abs(landingEvent.sink).toFixed(1)} m/s at ${Math.round(landingEvent.speed * 1.944)} kt was more than the gear could take.`,
        score: this.score,
        won: false,
      };
    }
    let landingScore = 0;
    let landingText = '';
    if (landingEvent.type === 'landed') {
      landingScore = landingEvent.firm ? 150 : 300;
      landingText = landingEvent.firm
        ? 'A firm arrival on the strip — the gear felt that one.'
        : 'A greaser: smooth touchdown, right on the strip.';
    } else {
      landingScore = 40;
      landingText = 'A rough off-field landing. The Kestrel survives, barely.';
    }
    if (!this.allRingsPassed) {
      return {
        title: 'SORTIE INCOMPLETE',
        detail: `${landingText} But ${this.totalRings - this.passed} ring(s) were still unflown, so the sortie does not count.`,
        score: this.score + landingScore,
        won: false,
      };
    }
    const timeBonus = Math.max(0, Math.round((s.parSeconds - this.elapsed)) * 2);
    const total = this.score + landingScore + timeBonus
      + Math.round(state.fuel) * 2 + Math.round(state.hull);
    let zoneText = '';
    if (s.stopZoneZ !== undefined) {
      if (state.pos.z <= s.stopZoneZ) { zoneText = ' Stopped inside the short-field zone — textbook.'; }
      else { zoneText = ' You rolled past the short-field zone; a slower approach would have stopped her in time.'; }
    }
    return {
      title: 'SORTIE COMPLETE',
      detail: `${landingText} All ${this.totalRings} rings threaded in ${formatTime(this.elapsed)} `
        + `(par ${formatTime(s.parSeconds)}).${zoneText}`,
      score: total,
      won: true,
    };
  }
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
