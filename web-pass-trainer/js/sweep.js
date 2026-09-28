// sweep.js — Gyro yaw-rate gate + 3-zone base coverage + damage calculation.
// Yaw rate is derived from the XR/sim camera quaternion each frame, so it works
// identically in WebXR (device gyro drives the camera) and in simulation mode.
import * as THREE from 'three';

export const Zone = Object.freeze({ None: 0, Left: 1, Center: 2, Right: 3 });

export class SweepTracker {
  constructor({
    minRate = 0.4, maxRate = 2.0, windowS = 2.5,
    halfWidthM = 0.45, damagePerSecond = 40,
  } = {}) {
    this.minRate = minRate; this.maxRate = maxRate;
    this.windowS = windowS; this.halfWidthM = halfWidthM;
    this.damagePerSecond = damagePerSecond;
    this.spraying = false; this.aimingAtBase = false;
    this.yawRate = 0; this.valid = false;
    this.hits = []; // {zone, t}
    this.coverageComplete = false;
    this._prevQ = new THREE.Quaternion();
    this._init = false;
    this.handlers = {};
  }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...a) { for (const h of this.handlers[evt] || []) h(...a); }

  // Call every frame with the camera's world quaternion.
  updateCamera(nowQ, dt) {
    if (!this._init) { this._prevQ.copy(nowQ); this._init = true; return; }
    const dq = nowQ.clone().multiply(this._prevQ.clone().invert());
    const angle = 2 * Math.acos(Math.min(Math.abs(dq.w), 1)); // total rad this frame
    // Yaw component only: project rotation axis onto world-up (approx via camera parent).
    const axis = new THREE.Vector3(dq.x, dq.y, dq.z);
    if (axis.lengthSq() > 1e-10) {
      axis.normalize();
      // World-up in camera space ~ inverse of camera up; approximate with yaw sign from Y.
      const yawFrac = Math.abs(axis.y);
      this.yawRate = (angle * yawFrac) / Math.max(dt, 1e-4);
    } else this.yawRate = 0;
    this._prevQ.copy(nowQ);
    const was = this.valid;
    this.valid = Math.abs(this.yawRate) >= this.minRate && Math.abs(this.yawRate) <= this.maxRate;
    if (was !== this.valid) this.emit('sweep', this.valid, this.yawRate);
    this.prune();
  }

  classify(fireGroup, worldPoint) {
    const local = fireGroup.worldToLocal(worldPoint.clone());
    const third = (this.halfWidthM * 2) / 3;
    if (Math.abs(local.x) > this.halfWidthM * 1.4 || Math.abs(local.z) > this.halfWidthM * 1.4) return Zone.None;
    if (local.x < -third / 2) return Zone.Left;
    if (local.x > third / 2) return Zone.Right;
    return Zone.Center;
  }

  // Records one spray impact. Returns true if the impact counted (gates passed).
  // Damage itself is granted once per frame via damageForFrame(dt).
  registerImpact(fireGroup, worldPoint) {
    if (!this.spraying || !this.aimingAtBase || !this.valid) return false;
    const zone = this.classify(fireGroup, worldPoint);
    if (zone === Zone.None) return false;
    const now = performance.now() / 1000;
    this.hits.push({ zone, t: now });
    this.emit('zone', zone);
    this.prune();
    return true;
  }

  // Frame-rate-independent damage path used by FireHazard (dt-scaled).
  damageForFrame(dt) {
    this.prune();
    const covered = new Set(this.hits.map((h) => h.zone));
    const ok = this.spraying && this.aimingAtBase && this.valid && covered.size >= 3;
    if (ok && !this.coverageComplete) { this.coverageComplete = true; this.emit('coverage'); }
    return ok ? this.damagePerSecond * dt : 0;
  }

  prune() {
    const now = performance.now() / 1000;
    this.hits = this.hits.filter((h) => now - h.t <= this.windowS);
    if (new Set(this.hits.map((h) => h.zone)).size < 3) this.coverageComplete = false;
  }

  zonesCovered() { this.prune(); return new Set(this.hits.map((h) => h.zone)); }

  reset() { this.hits = []; this.coverageComplete = false; this._init = false; }
}
