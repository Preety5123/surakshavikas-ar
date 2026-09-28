// session.js — WebXR immersive-ar placement + Simulation fallback (iOS/desktop).
// Unified surface: { mode:'xr'|'sim', camera, update(dt), tryPlaceFromScreen(x,y), distanceToFire() }
import * as THREE from 'three';

export class ARSession {
  constructor(renderer, scene, camera, fsm) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.fsm = fsm;
    this.mode = 'sim';
    this.fire = null;
    this.hitSource = null; this.refSpace = null;
    this.hitRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.15, 32),
      new THREE.MeshBasicMaterial({ color: 0x22ff88, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.hitRing.visible = false;
    this.hitRing.rotation.x = -Math.PI / 2;
    scene.add(this.hitRing);
    this.handlers = {};
    this._lastHit = null;
  }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...a) { for (const h of this.handlers[evt] || []) h(...a); }

  static async xrSupported() {
    try {
      return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
    } catch { return false; }
  }

  async enterXR(onEnd) {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
    });
    this.mode = 'xr';
    this.renderer.xr.enabled = true;
    await this.renderer.xr.setSession(session);
    this.refSpace = this.renderer.xr.getReferenceSpace();
    const viewerSpace = await session.requestReferenceSpace('viewer');
    this.hitSource = await session.requestHitTestSource({ space: viewerSpace });
    session.addEventListener('end', () => {
      this.mode = 'sim'; this.hitRing.visible = false;
      this.hitSource = null; onEnd?.();
    });
    // Tap (select) places the fire during Placement.
    const onSelect = () => {
      if (this.fsm.current === 'Placement' && this._lastHit && !this.fire) this.placeFire(this._lastHit);
    };
    // three.js XRController 'select' for immersive-ar: listen on session directly.
    session.addEventListener('select', onSelect);
    this.emit('mode', 'xr');
  }

  placeFire(position) {
    this.emit('placeRequest', position.clone());
  }

  setFire(fire) { this.fire = fire; }

  // Screen tap during Placement (XR select already handled; sim taps come here).
  tryPlaceFromScreen(x, y, raycaster, floorMesh) {
    if (this.mode !== 'sim' || this.fsm.current !== 'Placement' || this.fire) return false;
    raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.camera);
    const hit = raycaster.intersectObject(floorMesh, false);
    if (hit.length) { this.placeFire(hit[0].point); return true; }
    return false;
  }

  cameraWorldPos(out) { return this.camera.getWorldPosition(out); }

  distanceToFire() {
    if (!this.fire) return Infinity;
    const c = this.cameraWorldPos(new THREE.Vector3());
    const f = new THREE.Vector3(); this.fire.group.getWorldPosition(f);
    return c.distanceTo(f);
  }

  update(frame) {
    if (this.mode === 'xr' && frame && this.hitSource && this.refSpace) {
      const results = frame.getHitTestResults(this.hitSource);
      if (results.length && this.fsm.current === 'Placement' && !this.fire) {
        const pose = results[0].getPose(this.refSpace);
        this._lastHit = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
        this.hitRing.visible = true;
        this.hitRing.position.copy(this._lastHit);
      } else {
        this.hitRing.visible = false;
        if (!results.length) this._lastHit = null;
      }
    }
  }
}

// Simulation look controls: drag-to-look (all) + gyro look (mobile, after permission).
export class SimLook {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.yaw = 0; this.pitch = -0.15;
    this.gyro = false; this._alpha0 = null;
    this._dragging = false; this._lx = 0; this._ly = 0;
    dom.addEventListener('pointerdown', (e) => { this._dragging = true; this._lx = e.clientX; this._ly = e.clientY; });
    addEventListener('pointermove', (e) => {
      if (!this._dragging || this.gyro) return;
      this.yaw -= (e.clientX - this._lx) * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this._ly) * 0.004, -1.2, 1.2);
      this._lx = e.clientX; this._ly = e.clientY;
    });
    addEventListener('pointerup', () => { this._dragging = false; });
    addEventListener('deviceorientation', (e) => {
      if (!this.gyro || e.alpha == null) return;
      if (this._alpha0 == null) this._alpha0 = e.alpha;
      this.yaw = THREE.MathUtils.degToRad(-(e.alpha - this._alpha0));
      this.pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(e.beta ?? 90) - Math.PI / 2, -1.2, 1.2);
    });
  }
  async enableGyro() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      this.gyro = true; this._alpha0 = null;
      return true;
    } catch { return false; }
  }
  update() {
    if (this.gyro) return; // orientation handler drives yaw/pitch directly
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }
}
