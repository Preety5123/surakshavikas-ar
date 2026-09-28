// ui.js — DOM glue: subscribes to training events, drives HUD. No gameplay logic.
export class TrainingUI {
  constructor(fsm) {
    this.fsm = fsm;
    const $ = (id) => document.getElementById(id);
    this.warn = $('warn'); this.warnText = $('warnText');
    this.hint = $('hint'); this.health = $('health'); this.pin = $('pinBar');
    this.pressure = $('pressure'); this.squeeze = $('squeeze');
    this.success = $('success'); this.successMetrics = $('successMetrics');
    this.fail = $('fail'); this.badge = $('modeBadge');
    fsm.on('change', (prev, next) => this.onState(next));
  }
  bind({ placement, controller, pinEvents, fireEvents }) {
    placement.on('proximity', (tooClose, d) => {
      this.warn.classList.toggle('hidden', !tooClose);
      if (tooClose) this.warnText.textContent =
        `Too close! Step back to a safe operating distance (6–8 ft). [${d.toFixed(1)} m]`;
    });
    controller.on('aim', (atBase, hint) => { this.hint.textContent = hint; });
    controller.on('pinProgress', (p) => { this.pin.value = p; });
    pinEvents?.on('pinProgress', (p) => { this.pin.value = p; });
    fireEvents?.on('health', (h) => { this.health.value = h; });
    fireEvents?.on('extinguished', (m, pressure01, aim01) => this.showSuccess(m, pressure01, aim01));
  }
  onState(next) {
    this.squeeze.classList.toggle('hidden', !(next === 'SqueezeLever' || next === 'SweepMotion'));
    this.fail.classList.toggle('hidden', next !== 'FailedOut');
    if (next === 'Extinguished') this.success.classList.remove('hidden');
  }
  showSuccess(m, pressure01, aim01) {
    this.success.classList.remove('hidden');
    this.successMetrics.innerHTML =
      `Time Taken: <b>${m.timeTakenS.toFixed(1)}s</b><br>` +
      `Pressure Remaining: <b>${Math.round(pressure01 * 100)}%</b><br>` +
      `Aim Accuracy: <b>${Math.round(aim01 * 100)}%</b>`;
    // Integrate with SurakshaVikas history (same localStorage keys as web-preview).
    try {
      const r = JSON.parse(localStorage.getItem('svr') || '[]');
      r.push({ m: 'pass-web', pct: Math.round(aim01 * 100), passed: true, at: new Date().toISOString() });
      localStorage.setItem('svr', JSON.stringify(r));
    } catch { /* private mode */ }
  }
  setMode(mode) {
    this.badge.textContent = mode === 'xr' ? '📷 AR • LIVE TRACKING' : '🧪 SIMULATION — Training Only';
  }
  trackFire(fire) {
    fire.on('health', (h) => { this.health.value = h; });
  }
  tickPressure(p01) { this.pressure.value = p01; }
}
