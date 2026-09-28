// main.js — Bootstrap + wiring: renderer, rig, modules, game loop.
import * as THREE from 'three';
import { ExtinguisherFSM, TrainerState } from './fsm.js';
import { SynthAudio } from './audio.js';
import { SweepTracker } from './sweep.js';
import { FireHazard } from './fire.js';
import { Extinguisher } from './extinguisher.js';
import { ARSession, SimLook } from './session.js';
import { TrainingUI } from './ui.js';

const $ = (id) => document.getElementById(id);

// Surface boot/module errors on-screen (phones have no devtools handy).
function showFatal(msg) {
  const box = $('errbox');
  if (box) { box.classList.remove('hidden'); box.textContent += msg + '\n'; }
}
addEventListener('error', (e) => showFatal('Error: ' + (e.message || e.error)));
addEventListener('unhandledrejection', (e) => showFatal('Promise: ' + (e.reason?.message || e.reason)));

async function boot() {
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); // alpha: camera feed shows through in AR
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const SIM_BG = new THREE.Color(0x0b1f3a);
  const SIM_FOG = new THREE.Fog(0x0b1f3a, 8, 22);
  scene.background = SIM_BG;
  scene.fog = SIM_FOG;
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x332211, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 20;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Camera rig (works for both XR-driven and simulated cameras).
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
  const rig = new THREE.Group();
  rig.add(camera);
  rig.position.set(0, 0, 0);
  camera.position.set(0, 1.6, 3.2);
  camera.lookAt(0, 0.8, 0);
  scene.add(rig);

  // Simulation room floor (also the tap-to-place surface in sim mode).
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'SimFloor';
  scene.add(floor);
  const grid = new THREE.GridHelper(14, 14, 0x3d4c63, 0x223048);
  grid.position.y = 0.001;
  scene.add(grid);

  // Modules.
  const fsm = new ExtinguisherFSM();
  const audio = new SynthAudio();
  const tracker = new SweepTracker();
  const session = new ARSession(renderer, scene, camera, fsm);
  const look = new SimLook(camera, canvas);
  const ext = new Extinguisher(scene, camera, fsm, audio, tracker);
  const ui = new TrainingUI(fsm);
  ui.bind({
    placement: sessionPlacementEvents(session),
    controller: ext,
    pinEvents: ext,
  });

  let fire = null;
  const raycaster = new THREE.Raycaster();
  // Camera that rendered the current frame: XR view camera while presenting
  // (the user camera's projection is stale in AR), else the main camera.
  const viewCam = () => {
    if (renderer.xr.isPresenting) {
      const views = renderer.xr.getCamera().cameras;
      if (views && views.length) {
        const v = views[0];
        v.updateMatrixWorld();
        v.matrixWorldInverse.copy(v.matrixWorld).invert();
        return v;
      }
    }
    return camera;
  };  const sprayPts = [];
  const camQ = new THREE.Quaternion();
  const clock = new THREE.Clock();
  let lastWarn = 0; let lastTooClose = null; let lastPinMiss = -10;
  let pinDbg = '-';
  ext.on('pinDebug', (s) => { pinDbg = s; });
  // ?debug=1 overlay: live gate readout (state, spray, aim, yaw, sweep, zones, hp, pressure).
  const debugEl = $('debug');
  let debugTick = 0;
  if (!new URLSearchParams(location.search).has('debug')) debugEl.classList.add('hidden');

  // Placement.
  session.on('placeRequest', (pos) => {
    if (fire || fsm.current !== TrainerState.Placement) return;
    fire = new FireHazard(scene, audio);
    fire.setPosition(pos);
    fire.group.scale.setScalar(0.8);
    session.setFire(fire);
    audio.ensure(); audio.startFire();
    fsm.notifyPlaced();
    ui.trackFire(fire);
    fire.on('extinguished', (m) => {
      fsm.notifyExtinguished();
      ui.showSuccess(m, ext.pressure01, ext.aimAccuracy);
    });
    $('hint').textContent = 'Touch the red ring, drag it straight out →';
  });

  // Pointer: pin drag vs look vs tap-to-place.
  const ndc = new THREE.Vector2();
  let downX = 0, downY = 0, pinGrab = false, lookDrag = false;
  canvas.addEventListener('pointerdown', (e) => {
    audio.ensure();
    downX = e.clientX; downY = e.clientY; lookDrag = true;
    if (fsm.current === TrainerState.PullPin && !fire?.finished) {
      const vc = viewCam();
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, vc);
      pinGrab = ext.tryGrabPin(raycaster, e.clientX, e.clientY, vc);
      if (!pinGrab) lastPinMiss = performance.now() / 1000;
    }
  });
  addEventListener('pointermove', (e) => {
    if (pinGrab) {
      ext.dragPin(e.clientX - downX, e.clientY - downY, viewCam());
      downX = e.clientX; downY = e.clientY;
    }
  });
  addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (pinGrab) { ext.releasePin(); pinGrab = false; }
    else if (lookDrag && moved < 8 && fsm.current === TrainerState.Placement) {
      session.tryPlaceFromScreen(e.clientX, e.clientY, raycaster, floor);
    }
    lookDrag = false;
  });

  // Squeeze hold button.
  const sq = $('squeeze');
  const squeezeOn = (e) => { e.preventDefault(); audio.ensure(); ext.setSqueezing(true); };
  const squeezeOff = () => ext.setSqueezing(false);
  sq.addEventListener('pointerdown', squeezeOn);
  sq.addEventListener('pointerup', squeezeOff);
  sq.addEventListener('pointercancel', squeezeOff);
  sq.addEventListener('pointerleave', squeezeOff);

  // Start overlay buttons.
  const overlay = $('start');
  $('btnSim').addEventListener('click', () => {
    audio.ensure();
    overlay.classList.add('hidden');
    ui.setMode('sim');
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) $('btnGyro').classList.remove('hidden');
  });
  $('btnGyro').addEventListener('click', async () => {
    const ok = await look.enableGyro();
    $('btnGyro').textContent = ok ? '📳 Gyro look ON' : '⚠️ Gyro blocked';
  });
  // AR check with a timeout: a wedged XR service must not hang the UI forever.
  const xrOK = await Promise.race([
    ARSession.xrSupported(),
    new Promise((res) => setTimeout(() => res('timeout'), 4000)),
  ]);
  if (xrOK === true) {
    $('btnXR').classList.remove('hidden');
    $('btnXR').addEventListener('click', async () => {
      try {
        audio.ensure();
        await session.enterXR(() => {
          // Back to simulation visuals.
          scene.background = SIM_BG; scene.fog = SIM_FOG;
          floor.visible = true; grid.visible = true;
          ui.setMode('sim');
        });
        // AR visuals: transparent canvas + hide the virtual room.
        renderer.setClearColor(0x000000, 0);
        scene.background = null; scene.fog = null;
        floor.visible = false; grid.visible = false;
        ext.updateFraming(innerWidth / innerHeight);
        overlay.classList.add('hidden');
        ui.setMode('xr');
      } catch (err) {
        alert('Could not start AR: ' + err.message + '\nUse Simulation mode instead.');
      }
    });
  } else {
    $('xrNote').textContent = xrOK === 'timeout'
      ? '⚠️ AR check timed out (ARCore may be stuck — force-close Chrome and retry). Simulation works regardless.'
      : 'AR (WebXR) not available here — use Simulation. (Android Chrome + HTTPS required for real AR.)';
  }
  if (!window.isSecureContext) $('xrNote').textContent = '⚠️ Not a secure context — serve over HTTPS or localhost.';

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    ext.updateFraming(innerWidth / innerHeight);
  });

  // Main loop (setAnimationLoop is required for WebXR).
  renderer.setAnimationLoop((_, frame) => {
    const dt = Math.min(clock.getDelta(), 0.05);
    look.update();
    session.update(frame);
    camera.getWorldQuaternion(camQ);
    tracker.updateCamera(camQ, dt);
    ext.update(dt, fire);
    if (fire) {
      ext.collectSpray(sprayPts);
      fire.update(dt, sprayPts, tracker);
      // Safety proximity: 1.8 m operating distance.
      const d = session.distanceToFire();
      const tooClose = d < 1.8;
      const now = performance.now() / 1000;
      if (tooClose !== lastTooClose || (tooClose && now - lastWarn > 1)) {
        lastTooClose = tooClose; lastWarn = now;
        session.emit('proximity', tooClose, d);
      }
    }
    ui.tickPressure(ext.pressure01);
    // Contextual coaching: tell the user exactly which gate is blocking damage.
    if (fsm.current === 'Placement' && session.mode === 'xr') {
      $('hint').textContent = session.hasHit()
        ? '✅ Floor found — tap the green ring to place the fire!'
        : '📷 Scan the floor: tilt phone down, move slowly side-to-side…';
    } else if (fsm.current === 'PullPin' && performance.now() / 1000 - lastPinMiss < 2.5) {
      $('hint').textContent = '🎯 Touch the red ring on the extinguisher, then drag outward.';
    } else if (fire && !fire.finished && (fsm.current === 'SqueezeLever' || fsm.current === 'SweepMotion')) {      const hintEl = $('hint');
      if (ext.spraying && ext.aimingAtBase && !tracker.valid) {
        hintEl.textContent = '🧯 Spraying — now SWEEP side-to-side! Holding still will not put it out.';
      } else if (ext.spraying && ext.aimingAtBase && tracker.valid && tracker.zonesCovered().size < 3) {
        hintEl.textContent = '↔️ Keep sweeping across the whole base — cover LEFT, CENTER and RIGHT.';
      }
    }
    if (debugEl) {
      debugTick += dt;
      if (debugTick > 0.2) {
        debugTick = 0;
        const zones = fire ? [...tracker.zonesCovered()].join(',') : '-';
        debugEl.textContent =
          `state=${fsm.current} spray=${ext.spraying ? 1 : 0} aimBase=${ext.aimingAtBase ? 1 : 0} ` +
          `yaw=${tracker.yawRate.toFixed(2)} sweepOK=${tracker.valid ? 1 : 0} zones=[${zones}] ` +
          `hp=${fire ? fire.health.toFixed(0) : '-'} press=${ext.pressure01.toFixed(2)}\n${pinDbg}`;
      }
    }
    renderer.render(scene, camera);
  });
}

// Placement events adapter: session emits place/proximity; ui.bind expects .on().
function sessionPlacementEvents(session) {
  return { on: (evt, fn) => session.on(evt, fn) };
}

boot();
