// Synthesised sound for Kestrel Skies: no audio files, everything is WebAudio.
// A puttering prop engine whose pitch follows the throttle, wind that rises with
// airspeed, and small one-shot cues for rings, warnings and touchdowns.
export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.stallTimer = 0;
  }

  // Browsers only allow audio after a gesture, so main calls this on the first
  // key press or click. Safe to call again; it builds the graph once.
  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass, gain tied to throttle.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const engineSub = ctx.createOscillator();
    engineSub.type = 'square';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(engineFilter);
    engineSub.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.frequency.value = 58;
    engineSub.frequency.value = 29;
    this.engineOsc.start();
    engineSub.start();
    this.engineSub = engineSub;
    this.engineFilter = engineFilter;

    // Wind: looped noise through a bandpass, gain tied to airspeed.
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();
  }

  // Called every frame with the flight state; keeps engine and wind honest.
  update(throttle, speedKnots, stalled, dt) {
    if (!this.context) return;
    const t = this.context.currentTime;
    const rpm = 52 + throttle * 68;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + throttle * 700, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.13, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.22, speedKnots / 480), t, 0.15);

    this.stallTimer -= dt;
    if (stalled && this.stallTimer <= 0) {
      this.stallTimer = 0.55;
      this.blip(1180, 0.09, 'square', 0.06);
    }
  }

  blip(freq, seconds, type, volume) {
    if (!this.context) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  ringChime() {
    this.blip(880, 0.16, 'sine', 0.16);
    setTimeout(() => this.blip(1318, 0.22, 'sine', 0.16), 70);
  }

  touchdownThud() {
    this.blip(74, 0.28, 'sine', 0.3);
  }

  fanfare() {
    if (!this.context) return;
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => this.blip(freq, 0.3, 'triangle', 0.16), i * 110);
    });
  }
}
