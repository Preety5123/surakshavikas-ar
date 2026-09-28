// audio.js — Zero-asset WebAudio synth: metallic pin, spray noise loop, fire crackle loop.
export class SynthAudio {
  constructor() {
    this.ctx = null; this.sprayGain = null; this.spraySrc = null;
    this.fireGain = null; this.fireSrc = null; this.fireFilter = null;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  noiseBuffer(seconds = 2) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  // Metallic "ping" for pin breakaway: detuned triangle partials + click.
  pin() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [2093, 2960, 523].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.25 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.55);
    });
  }
  startSpray() {
    if (!this.ensure() || this.spraySrc) return;
    const ctx = this.ctx;
    this.spraySrc = ctx.createBufferSource();
    this.spraySrc.buffer = this.noiseBuffer(); this.spraySrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
    this.sprayGain = ctx.createGain();
    this.sprayGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.sprayGain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.15);
    this.spraySrc.connect(bp).connect(this.sprayGain).connect(ctx.destination);
    this.spraySrc.start();
  }
  stopSpray() {
    if (!this.spraySrc) return;
    const src = this.spraySrc, g = this.sprayGain, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 200);
    this.spraySrc = null; this.sprayGain = null;
  }
  startFire() {
    if (!this.ensure() || this.fireSrc) return;
    const ctx = this.ctx;
    this.fireSrc = ctx.createBufferSource();
    this.fireSrc.buffer = this.noiseBuffer(3); this.fireSrc.loop = true;
    this.fireFilter = ctx.createBiquadFilter(); this.fireFilter.type = 'lowpass'; this.fireFilter.frequency.value = 900;
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0.16;
    // Crackle LFO on gain.
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 7; lg.gain.value = 0.05;
    lfo.connect(lg).connect(this.fireGain.gain); lfo.start();
    this.fireSrc.connect(this.fireFilter).connect(this.fireGain).connect(ctx.destination);
    this.fireSrc.start();
    this._fireLfo = lfo;
  }
  setFireLevel(h01) {
    if (this.fireGain) this.fireGain.gain.value = 0.02 + 0.16 * h01;
    if (this.fireFilter) this.fireFilter.frequency.value = 300 + 700 * h01;
  }
  stopFire() {
    if (!this.fireSrc) return;
    try { this.fireSrc.stop(); this._fireLfo.stop(); } catch { /* already stopped */ }
    this.fireSrc = null; this.fireGain = null;
  }
}
