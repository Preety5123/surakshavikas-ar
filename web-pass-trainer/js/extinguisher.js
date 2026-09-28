// extinguisher.js — Camera-mounted model: lever kinematics, pin drag, spray, aim raycast.
import * as THREE from 'three';
import { ParticlePool } from './particles.js';

const LEVER_ANGLE = THREE.MathUtils.degToRad(15);
const PIN_THRESHOLD_M = 0.05;
const PRESSURE_SECONDS = 12;

export class Extinguisher {
  constructor(scene, camera, fsm, audio, tracker) {
    this.fsm = fsm; this.audio = audio; this.tracker = tracker;
    this.camera = camera;
    this.pressureLeft = PRESSURE_SECONDS;
    this.squeezing = false; this.spraying = false;
    this.failed = false;
    this.aimingAtBase = false; this.aimingAtUpper = false;
    this.hint = 'Aim at the fire.';
    this.sprayFrames = 0; this.aimedFrames = 0;
    this.handlers = {};
    this._pinVel = new THREE.Vector3();
    this._pinFlying = false;
    this._ray = new THREE.Raycaster();

    this.group = new THREE.Group();
    this.group.name = 'Extinguisher';
    const red = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.4, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8b93a, roughness: 0.3, metalness: 0.9 });

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 6, 12), red);
    this.body.position.y = -0.05;
    this.group.add(this.body);

    this.leverPivot = new THREE.Group();
    this.leverPivot.position.set(0, 0.1, 0);
    this.lever = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.03), dark);
    this.lever.position.x = 0.07;
    this.leverPivot.add(this.lever);
    this.group.add(this.leverPivot);

    // Safety pin (draggable child with its own hitbox + invisible grab proxy).
    // Oversized deliberately: at phone scale a realistic pin is untappable.
    this.pin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 10), brass);
    this.pin.position.set(0.06, 0.1, 0);
    this.pin.rotation.z = Math.PI / 2;
    this.pin.name = 'SafetyPin';
    this.pinProxy = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    this.pin.add(this.pinProxy);
    // Red pull-ring at the pin's outer end: the visible "grab me" affordance.
    // (Pin is z-rotated, so parent +X extraction dir == pin-local -Y.)
    this.pinRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.007, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xd92d20, roughness: 0.5 })
    );
    this.pinRing.position.set(0, -0.058, 0);
    this.pinRing.rotation.x = Math.PI / 2;
    this.pin.add(this.pinRing);
    this.group.add(this.pin);
    this._pinHome = this.pin.position.clone();
    this._pinAxis = new THREE.Vector3(1, 0, 0); // local extraction axis
    this._pinDrag = 0; this._pinGrabbed = false; this.pinPulled = false;

    // Nozzle along camera-forward (-Z in three.js).
    this.nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.16, 10), dark);
    this.nozzle.rotation.x = Math.PI / 2;
    this.nozzle.position.set(0, 0.03, -0.14);
    this.group.add(this.nozzle);
    this.nozzleTip = new THREE.Object3D();
    this.nozzleTip.position.set(0, 0.03, -0.24);
    this.group.add(this.nozzleTip);

    // Reticle ring just ahead of the tip; tinted by aim state.
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.012, 0.02, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false })
    );
    this.reticle.position.set(0, 0.03, -0.3);
    this.reticle.renderOrder = 999;
    this.group.add(this.reticle);

    // Spray particles live in world space; emitter transform read from nozzleTip.
    this.spray = new ParticlePool(scene, { count: 400, size: 0.09, color: 0xf2f2e8 });
    this.spray.gravity = -1.5; this.spray.drag = 0.6;
    this.spray.visible = true;

    this._tipPos = new THREE.Vector3(); this._tipDir = new THREE.Vector3();
    camera.add(this.group);
    this.updateFraming(innerWidth / innerHeight);
    this.group.rotation.y = -0.12;
  }

  // Aspect-aware viewmodel framing: hold the model at a fixed depth and place
  // it at fractions of the visible half-extents (capped), so it stays inside
  // safe bounds on portrait, landscape, and wide-FOV passthrough alike.
  updateFraming(aspect, vfovDeg = 60, depth = 0.7) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(vfovDeg) / 2) * depth;
    const halfW = halfH * aspect;
    this.group.scale.setScalar(0.55);
    this.group.position.set(
      Math.min(halfW * 0.62, 0.3),
      -Math.min(halfH * 0.52, 0.24),
      -depth
    );
  }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...a) { for (const h of this.handlers[evt] || []) h(...a); }

  get pressure01() { return Math.max(this.pressureLeft / PRESSURE_SECONDS, 0); }
  get aimAccuracy() { return this.sprayFrames === 0 ? 0 : this.aimedFrames / this.sprayFrames; }

  setSqueezing(b) {
    if (this.failed) b = false;
    if (b && !this.fsm.leverUnlocked) { console.warn('[Ext] Squeeze blocked — pin not pulled.'); return; }
    if (this.squeezing === b) return;
    this.squeezing = b;
    this.emit('squeeze', b);
    if (b) this.fsm.notifySqueezeStarted();
  }

  // --- Pin drag API (pointer events routed from main.js) ---
  // Primary: screen-space proximity (deterministic under XR cameras).
  // Fallback: classic raycast. `cam` must be the camera that rendered the
  // current frame (the XR view camera while presenting, else the main camera).
  tryGrabPin(raycaster, xPx, yPx, cam = null) {
    if (this.pinPulled || this.fsm.current !== 'PullPin') return false;
    const view = cam || this.camera;
    const p = new THREE.Vector3();
    this.pin.getWorldPosition(p);
    p.project(view);
    let grabbed = false;
    let dbg = 'n/a';
    if (p.z < 1) {
      const sx = (p.x * 0.5 + 0.5) * innerWidth;
      const sy = (-p.y * 0.5 + 0.5) * innerHeight;
      const dPx = Math.hypot(xPx - sx, yPx - sy);
      dbg = `pin(${sx.toFixed(0)},${sy.toFixed(0)}) touch(${xPx.toFixed(0)},${yPx.toFixed(0)}) d=${dPx.toFixed(0)}`;
      this.emit('pinDebug', dbg);
      if (dPx < 70) grabbed = true;
    } else {
      this.emit('pinDebug', 'pin behind camera');
    }
    if (!grabbed) {
      const hit = raycaster.intersectObjects([this.pin, this.pinProxy], false);
      if (hit.length) grabbed = true;
    }
    if (!grabbed) {
      // Generous fallback: touching ANY part of the extinguisher grabs the pin.
      // The training-relevant skill (axis-constrained drag past 5cm) is unchanged;
      // only the touch target is forgiving at phone scale.
      const hitBody = raycaster.intersectObject(this.group, true);
      if (hitBody.length) grabbed = true;
    }
    if (grabbed) { this._pinGrabbed = true; this.emit('pinGrabbed'); return true; }
    this.emit('pinMiss');
    return false;
  }
  dragPin(dxPx, dyPx, camera) {
    if (!this._pinGrabbed || this.pinPulled) return;
    // Project the pin's world extraction axis onto the screen: only motion
    // along the VISIBLE pull direction counts (axis-constrained per spec,
    // but forgiving of drag angle — not horizontal-pixels-only).
    const axisWorld = this._pinAxis.clone()
      .applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const tipA = new THREE.Vector3(); this.pin.getWorldPosition(tipA);
    const tipB = tipA.clone().addScaledVector(axisWorld, 0.05);
    const sA = tipA.project(camera);
    const sB = tipB.project(camera);
    const dir = new THREE.Vector2(sB.x - sA.x, -(sB.y - sA.y));
    if (dir.lengthSq() < 1e-10) return;
    dir.normalize();
    const alongPx = new THREE.Vector2(dxPx, -dyPx).dot(dir);
    if (alongPx > 0) {
      const pixelsToMeters = 0.0009; // ~50px of on-axis drag breaks the 5cm pin
      this._pinDrag = Math.min(this._pinDrag + alongPx * pixelsToMeters, 0.12);
      this.pin.position.copy(this._pinHome).addScaledVector(this._pinAxis, this._pinDrag);
      this.emit('pinProgress', Math.min(this._pinDrag / PIN_THRESHOLD_M, 1));
      if (this._pinDrag >= PIN_THRESHOLD_M) this.breakPin(axisWorld);
    }
  }
  releasePin() {
    // Keep partial progress across grabs (no snap-back): only a full 5cm pull breaks the pin.
    this._pinGrabbed = false;
  }
  breakPin(axisWorld) {
    this._pinGrabbed = false; this.pinPulled = true;
    // Detach to scene, keep world transform, toss with mini ballistics.
    const wp = new THREE.Vector3(); this.pin.getWorldPosition(wp);
    this.pin.updateWorldMatrix(true, false);
    this.group.parent.add(this.pin);
    this.pin.position.copy(this.group.parent.worldToLocal(wp.clone()));
    this._pinVel.copy(axisWorld).multiplyScalar(1.4); this._pinVel.y += 0.8;
    this._pinFlying = true;
    setTimeout(() => { this.pin.visible = false; }, 5000);
    this.audio?.pin();
    this.emit('pinProgress', 1);
    this.emit('pinPulled');
    this.fsm.notifyPinPulled();
  }

  nozzleWorld(outPos, outDir) {
    this.nozzleTip.getWorldPosition(outPos);
    outDir.set(0, 0, -1).applyQuaternion(this.nozzleTip.getWorldQuaternion(new THREE.Quaternion()));
    return outDir;
  }

  update(dt, fire) {
    // Lever kinematics: rest -> -15° squeezed.
    const target = this.squeezing ? -LEVER_ANGLE : 0;
    this.leverPivot.rotation.z += (target - this.leverPivot.rotation.z) * Math.min(dt * 10, 1);

    // Pulsing highlight on the pin while it is the active task.
    if (!this.pinPulled) {
      if (this.fsm.current === 'PullPin') {
        const s = 0.5 + 0.5 * Math.sin(performance.now() / 180);
        this.pin.material.emissive.setRGB(0.7 * s, 0.4 * s, 0.05 * s);
      } else this.pin.material.emissive.setRGB(0, 0, 0);
    }

    // Pin ballistics.
    if (this._pinFlying && this.pin.visible) {
      this._pinVel.y -= 4.5 * dt;
      this.pin.position.addScaledVector(this._pinVel, dt);
      this.pin.rotation.x += 6 * dt; this.pin.rotation.z += 4 * dt;
    }

    // Aim raycast along nozzle.
    this.aimingAtBase = false; this.aimingAtUpper = false;
    if (fire && !fire.finished) {
      this.nozzleWorld(this._tipPos, this._tipDir);
      this._ray.set(this._tipPos, this._tipDir);
      this._ray.far = 12;
      const hits = this._ray.intersectObjects([fire.baseMesh, fire.upperMesh], false);
      if (hits.length) {
        const tag = hits[0].object.userData.tag;
        if (tag === 'FireBase') {
          this.aimingAtBase = true;
          this.hint = 'Good — on the base! Sweep side to side.';
          this.fsm.notifyAimLocked();
        } else if (tag === 'FireUpper') {
          this.aimingAtUpper = true;
          this.hint = 'Aim lower at the base of the fire!';
        }
      } else this.hint = 'Aim at the base of the fire.';
    }
    this.reticle.material.color.set(this.aimingAtBase ? 0x22ff44 : this.aimingAtUpper ? 0xff2222 : 0xffffff);
    this.emit('aim', this.aimingAtBase, this.hint);

    // Spray + pressure.
    const want = this.squeezing && this.fsm.canSpray && this.pressureLeft > 0 && !this.failed;
    if (want) {
      this.pressureLeft = Math.max(0, this.pressureLeft - dt);
      this.sprayFrames++;
      if (this.aimingAtBase) this.aimedFrames++;
      this.nozzleWorld(this._tipPos, this._tipDir);
      const side = new THREE.Vector3().crossVectors(this._tipDir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(side, this._tipDir).normalize();
      const n = 4;
      for (let i = 0; i < n; i++) {
        const spread = 0.06;
        const v = this._tipDir.clone().multiplyScalar(7 + Math.random() * 2)
          .addScaledVector(side, (Math.random() - 0.5) * spread * 7)
          .addScaledVector(up, (Math.random() - 0.5) * spread * 7);
        this.spray.spawn(this._tipPos.x, this._tipPos.y, this._tipPos.z,
          v.x, v.y, v.z, 0.9 + Math.random() * 0.3, 0xf2f2e8, 1);
      }
    }
    if (want !== this.spraying) {
      this.spraying = want;
      if (want) this.audio?.startSpray(); else this.audio?.stopSpray();
    }
    this.spray.update(dt);

    if (this.pressureLeft <= 0 && !this.failed) {
      this.failed = true;
      this.setSqueezing(false);
      const fireAlive = !fire || !fire.isOut;
      if (fireAlive) this.fsm.notifyPressureEmpty('pressure=0');
    }

    this.tracker.spraying = this.spraying;
    this.tracker.aimingAtBase = this.aimingAtBase;
  }

  // Collect alive spray particle world positions for fire intake.
  collectSpray(out) {
    out.length = 0;
    if (!this.spraying) return out;
    this.spray.forEachAlive((v) => out.push(v.clone()));
    return out;
  }
}
