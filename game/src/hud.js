// Cockpit instruments for Kestrel Skies: digital readouts, fuel and airframe
// bars, the mission card, centre flashes and a canvas artificial horizon.
import { headingDegrees } from './aircraft.js';
import { formatTime } from './course.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.flashTimer = 0;
    this.horizonCtx = $('horizon').getContext('2d');
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  flash(text, seconds = 1.4) {
    const el = $('flash');
    el.textContent = text;
    el.style.opacity = '1';
    this.flashTimer = seconds;
  }

  update(state, course, dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) $('flash').style.opacity = '0';
    }
    $('ro-speed').textContent = Math.round(state.speed * 1.944);
    $('ro-alt').textContent = Math.max(0, Math.round(state.pos.y * 3.281));
    $('ro-vs').textContent = Math.round(state.vy * 196.85);
    $('ro-thr').textContent = Math.round(state.throttle * 100);
    $('heading-readout').textContent = 'HDG ' + String(Math.round(headingDegrees(state))).padStart(3, '0');
    $('stall-warning').classList.toggle('hidden', !state.stalled);

    if (course && course.sortie) {
      $('mission-name').textContent = course.sortie.name;
      $('mission-objective').textContent = course.sortie.objective;
      $('stat-rings').textContent = `RINGS ${course.passed}/${course.totalRings}`;
      $('stat-time').textContent = formatTime(course.elapsed);
      $('score-value').textContent = 'SCORE ' + course.score;
    }
    $('fuel-fill').style.width = `${state.fuel}%`;
    const hull = $('hull-fill');
    hull.style.width = `${state.hull}%`;
    hull.style.background = state.hull < 35
      ? 'linear-gradient(90deg, #d9534f, #f2837d)'
      : 'linear-gradient(90deg, #57d977, #a5f2b8)';
    this.drawHorizon(state);
  }

  // A simple attitude ball: sky over earth, rolled and pitched with the plane.
  drawHorizon(state) {
    const ctx = this.horizonCtx;
    const W = 150, H = 150, cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(cx, cy, 72, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.roll);
    const pitchPx = state.pitch * 130;
    ctx.fillStyle = '#3a7bd5';
    ctx.fillRect(-110, -110 + pitchPx, 220, 110);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-110, pitchPx, 220, 110);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-110, pitchPx);
    ctx.lineTo(110, pitchPx);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol and bezel.
    ctx.strokeStyle = '#ffd97a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx, cy + 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,210,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 72, 0, Math.PI * 2);
    ctx.stroke();
  }

  showEnd(result) {
    $('end-title').textContent = result.title;
    $('end-detail').textContent = result.detail;
    $('end-score').textContent = `SCORE ${result.score} · RINGS BONUS INCLUDED`;
    $('endcard').classList.remove('hidden');
  }

  hideEnd() { $('endcard').classList.add('hidden'); }
}
