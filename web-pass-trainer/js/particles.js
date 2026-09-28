// particles.js — Tiny CPU particle pool on THREE.Points (flames, smoke, steam, spray).
import * as THREE from 'three';

export class ParticlePool {
  constructor(scene, { count = 300, size = 0.12, color = 0xffffff, blending = THREE.AdditiveBlending, opacity = 0.9 } = {}) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);   // remaining
    this.span = new Float32Array(count);   // total
    this.baseSize = new Float32Array(count);
    this.baseCol = new Float32Array(count * 3);
    this.cursor = 0;
    this.gravity = 0; this.drag = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const m = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity,
      blending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this._tmpColor = new THREE.Color(color);
    // Park all particles far underground.
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    scene.add(this.points);
    this.mesh = this.points;
  }
  spawn(px, py, pz, vx, vy, vz, life, color, sizeMul = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([px, py, pz], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.span[i] = life;
    const c = this._tmpColor.set(color);
    this.baseCol.set([c.r, c.g, c.b], i * 3);
    this.baseSize[i] = sizeMul;
  }
  update(dt) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -100; this.col[j] = this.col[j + 1] = this.col[j + 2] = 0; continue; }
      const dragK = 1 - Math.min(this.drag * dt, 0.9);
      this.vel[j] *= dragK; this.vel[j + 2] *= dragK;
      this.vel[j + 1] = this.vel[j + 1] * dragK + this.gravity * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = this.life[i] / this.span[i]; // 1 -> 0 fade
      this.col[j] = this.baseCol[j] * f;
      this.col[j + 1] = this.baseCol[j + 1] * f;
      this.col[j + 2] = this.baseCol[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
  // Iterate alive particles (world space) — spray uses object-local coords; pass a matrix.
  forEachAlive(cb, matrixWorld = null) {
    const v = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      if (matrixWorld) v.applyMatrix4(matrixWorld);
      cb(v, i);
    }
  }
  set visible(v) { this.points.visible = v; }
}
