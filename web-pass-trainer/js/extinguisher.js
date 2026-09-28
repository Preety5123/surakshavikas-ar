// extinguisher.js — Camera-mounted model: lever kinematics, pin drag, spray, aim raycast.
import * as THREE from 'three';
import { ParticlePool } from './particles.js';

const LEVER_ANGLE = THREE.MathUtils.degToRad(15);
const PIN_THRESHOLD_M = 0.05;
const PRESSURE_SECONDS = 12;

export class Extinguisher {
  constructor(scene, camera, fsm, audio, tracker) {
    this.fsm = fsm; this.audio = audio; this.tracker = tracker;
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

    // Safety pin (draggable child with its own hitbox).
    this.pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 10), brass);
    this.pin.position.set(0.05, 0.1, 0);
    this.pin.rotation.z = Math.PI / 2;
    this.pin.name = 'SafetyPin';
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
    this.group.position.set(0.26, -0.22, -0.55);
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
  tryGrabPin(raycaster) {
    if (this.pinPulled || this.fsm.current !== 'PullPin') return false;
    const hit = raycaster.intersectObject(this.pin, false);
    if (hit.length) { this._pinGrabbed = true; return true; }
    return false;
  }
  dragPin(dxPixels, camera) {
    if (!this._pinGrabbed || this.pinPulled) return;
    // Map horizontal screen drag onto the pin's world-space extraction axis.
    const axisWorld = this._pinAxis.clone().applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const pixelsToMeters = 0.0006; // ~0.6mm per px at typical depth
    const along = dxPixels * pixelsToMeters * Math.sign(axisWorld.dot(camRight) || 1);
    if (along > 0) {
      this._pinDrag = Math.min(this._pinDrag + along, 0.12);
      this.pin.position.copy(this._pinHome).addScaledVector(this._pinAxis, this._pinDrag);
      this.emit('pinProgress', Math.min(this._pinDrag / PIN_THRESHOLD_M, 1));
      if (this._pinDrag >= PIN_THRESHOLD_M) this.breakPin(axisWorld);
    }
  }
  releasePin() {
    if (this._pinGrabbed && !this.pinPulled) {
      this._pinGrabbed = false; this._pinDrag = 0;
      this.pin.position.copy(this._pinHome);
      this.emit('pinProgress', 0);
    }
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
