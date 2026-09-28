// fire.js — FireHazard: health, segmented colliders, visual/audio degradation, metrics.
import * as THREE from 'three';
import { ParticlePool } from './particles.js';

export class FireHazard {
  constructor(scene, audio, { maxHealth = 100, baseHalfWidth = 0.45 } = {}) {
    this.audio = audio;
    this.maxHealth = maxHealth; this.health = maxHealth;
    this.finished = false;
    this.startTime = performance.now() / 1000;
    this.handlers = {};
    this.group = new THREE.Group();
    this.group.name = 'FireHazard';

    // Segment 1: FireBase — flat cylinder at ground level.
    this.baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(baseHalfWidth, baseHalfWidth, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x241414, roughness: 1 })
    );
    this.baseMesh.position.y = 0.03;
    this.baseMesh.userData.tag = 'FireBase';
    this.baseMesh.name = 'FireBase';
    this.baseMesh.castShadow = true;

    // Transparent shadow-catcher so the fire sits grounded on the real floor.
    this.shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.position.y = 0.004;
    this.shadowCatcher.receiveShadow = true;
    this.group.add(this.shadowCatcher);

    // Segment 2: FireUpper — capsule of rising flames/smoke (aiming feedback only).
    this.upperMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.9, 6, 12),
      new THREE.MeshStandardMaterial({
        color: 0xff6a00, transparent: true, opacity: 0.28,
        emissive: 0xff4400, emissiveIntensity: 0.8, depthWrite: false,
      })
    );
    this.upperMesh.position.y = 0.95;
    this.upperMesh.userData.tag = 'FireUpper';
    this.upperMesh.name = 'FireUpper';

    this.group.add(this.baseMesh, this.upperMesh);

    // Particle systems (pools live in world space; we spawn at group transform).
    this.flames = new ParticlePool(scene, { count: 260, size: 0.22, color: 0xff7a00 });
    this.smoke = new ParticlePool(scene, { count: 120, size: 0.5, color: 0x555555, blending: THREE.NormalBlending, opacity: 0.45 });
    this.steam = new ParticlePool(scene, { count: 160, size: 0.4, color: 0xeeeeee, blending: THREE.NormalBlending, opacity: 0.5 });
    this.flames.gravity = 2.2; this.smoke.gravity = 1.2; this.steam.gravity = 0.8;

    this.light = new THREE.PointLight(0xff8c26, 30, 6, 1.8);
    this.light.position.y = 1.0;
    this.group.add(this.light);

    this._acc = 0;
    scene.add(this.group);
  }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...a) { for (const h of this.handlers[evt] || []) h(...a); }

  get health01() { return Math.max(this.health / this.maxHealth, 0); }
  get isOut() { return this.health <= 0; }

  setPosition(p) { this.group.position.copy(p); }

  applyDamage(amount) {
    if (this.finished || this.isOut || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.applyDegradation();
    this.emit('health', this.health01);
    this.audio?.setFireLevel(this.health01);
    if (this.isOut) this.extinguish();
  }

  applyDegradation() {
    const h = this.health01;
    this.upperMesh.material.opacity = 0.06 + 0.24 * h;
    this.upperMesh.scale.setScalar(0.35 + 0.65 * h);
    this.light.intensity = 30 * h;
  }

  // dt: seconds. sprayPts: alive spray particle world positions (array of Vector3).
  // tracker: SweepTracker (gates aim/sweep/coverage). metrics: {aimed:boolean}
  update(dt, sprayPts, tracker) {
    if (this.finished) { this.flames.update(dt); this.smoke.update(dt); this.steam.update(dt); return; }
    this._acc += dt;
    const h = this.health01;
    const o = new THREE.Vector3();
    this.group.getWorldPosition(o);

    // Eye candy emission (rates scale with health).
    const emitN = (pool, n, fn) => { for (let i = 0; i < n; i++) fn(pool); };
    if (this._acc > 1 / 40) {
      emitN(this.flames, Math.round(2 * h) + 1, (p) => p.spawn(
        o.x + (Math.random() - 0.5) * 0.5, o.y + 0.1, o.z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4,
        0.5 + Math.random() * 0.4, Math.random() < 0.5 ? 0xff7a00 : 0xffd23f, 0.7 + 0.6 * h));
      if (Math.random() < 0.5) emitN(this.smoke, 1, (p) => p.spawn(
        o.x, o.y + 1.4, o.z, (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3,
        1.6 + Math.random(), 0x444444, 1));
      if (Math.random() < (1 - h) * 0.9 + 0.05) emitN(this.steam, 2, (p) => p.spawn(
        o.x + (Math.random() - 0.5) * 0.6, o.y + 0.25, o.z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8,
        1.1 + Math.random() * 0.5, 0xdddddd, 1));
      this._acc = 0;
    }

    // Damage intake: spray particles inside the base cylinder volume.
    // (Base geometry radius 0.45 × group scale 0.8.)
    const R = 0.36, baseY = o.y;
    for (const pt of sprayPts) {
      const dx = pt.x - o.x, dz = pt.z - o.z, dy = pt.y - baseY;
      if (dx * dx + dz * dz < R * R && dy > -0.1 && dy < 0.8) {
        tracker.registerImpact(this.group, pt);
      }
    }
    this.applyDamage(tracker.damageForFrame(dt));

    this.flames.update(dt); this.smoke.update(dt); this.steam.update(dt);
  }

  extinguish() {
    this.finished = true;
    this.upperMesh.visible = false;
    this.light.intensity = 0;
    this.audio?.stopFire();
    const metrics = {
      timeTakenS: performance.now() / 1000 - this.startTime,
      aimAccuracy01: this._aimAcc ?? 0,
    };
    this.emit('extinguished', metrics);
  }
}
