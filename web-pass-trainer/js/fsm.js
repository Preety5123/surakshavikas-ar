// fsm.js — Strict P.A.S.S. state machine. No skipping: transitions are whitelisted.
export const TrainerState = Object.freeze({
  Placement: 'Placement',
  PullPin: 'PullPin',
  AimAtBase: 'AimAtBase',
  SqueezeLever: 'SqueezeLever',
  SweepMotion: 'SweepMotion',
  Extinguished: 'Extinguished',
  FailedOut: 'FailedOut',
});

const ALLOWED = {
  Placement: ['PullPin'],
  PullPin: ['AimAtBase'],
  AimAtBase: ['SqueezeLever'],
  SqueezeLever: ['SweepMotion'],
  SweepMotion: ['Extinguished', 'FailedOut'],
  Extinguished: [],
  FailedOut: [],
};

export class Emitter {
  constructor() { this.handlers = {}; }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this.handlers[evt] = (this.handlers[evt] || []).filter((h) => h !== fn); }
  emit(evt, ...args) { for (const h of this.handlers[evt] || []) { try { h(...args); } catch (e) { console.error(e); } } }
}

export class ExtinguisherFSM extends Emitter {
  constructor() { super(); this.current = TrainerState.Placement; }

  tryTo(next, context = '') {
    if (this.current === next) return true;
    if (this.current === TrainerState.Extinguished || this.current === TrainerState.FailedOut) {
      this.emit('illegal', this.current, `Terminal state; cannot move to ${next}. ${context}`);
      return false;
    }
    if ((ALLOWED[this.current] || []).includes(next)) {
      const prev = this.current;
      this.current = next;
      this.emit('change', prev, next);
      return true;
    }
    this.emit('illegal', this.current, `Blocked ${this.current} -> ${next}. ${context}`);
    console.warn(`[FSM] Illegal transition ${this.current} -> ${next}. ${context}`);
    return false;
  }

  notifyPlaced() { return this.tryTo(TrainerState.PullPin, '(fire placed)'); }
  notifyPinPulled() { return this.tryTo(TrainerState.AimAtBase, '(pin extracted)'); }
  notifyAimLocked() {
    if (this.current === TrainerState.AimAtBase) return this.tryTo(TrainerState.SqueezeLever, '(aim locked)');
    return false;
  }
  notifySqueezeStarted() {
    if (this.current === TrainerState.SqueezeLever) return this.tryTo(TrainerState.SweepMotion, '(lever squeezed)');
    return false;
  }
  notifyExtinguished() { return this.tryTo(TrainerState.Extinguished, '(fire out)'); }
  notifyPressureEmpty(reason = '') {
    if (this.current === TrainerState.SqueezeLever || this.current === TrainerState.SweepMotion)
      return this.tryTo(TrainerState.FailedOut, `(out of pressure) ${reason}`);
    return false;
  }

  get leverUnlocked() {
    return this.current !== TrainerState.Placement && this.current !== TrainerState.PullPin;
  }
  get canSpray() {
    return this.current === TrainerState.SqueezeLever || this.current === TrainerState.SweepMotion;
  }
}
