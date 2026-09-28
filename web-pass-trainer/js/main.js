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

async function boot() {
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1f3a);
  scene.fog = new THREE.Fog(0x0b1f3a, 8, 22);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x332211, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 2);
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
  const sprayPts = [];
  const camQ = new THREE.Quaternion();
  const clock = new THREE.Clock();
  let lastWarn = 0; let lastTooClose = null;
  // ?debug=1 overlay: live gate readout (state, spray, aim, yaw, sweep, zones, hp, pressure).
  const debugEl = $('debug');
  let debugTick = 0;
  if (!new URLSearchParams(location.search).has('debug')) debugEl.classList.add('hidden');

  // Placement.
  session.on('placeRequest', (pos) => {
    if (fire || fsm.current !== TrainerState.Placement) return;
    fire = new FireHazard(scene, audio);
    fire.setPosition(pos);
    session.setFire(fire);
    audio.ensure(); audio.startFire();
    fsm.notifyPlaced();
    ui.trackFire(fire);
    fire.on('extinguished', (m) => {
      fsm.notifyExtinguished();
      ui.showSuccess(m, ext.pressure01, ext.aimAccuracy);
    });
    $('hint').textContent = 'Drag the brass pin straight out →';
  });

  // Pointer: pin drag vs look vs tap-to-place.
  const ndc = new THREE.Vector2();
  let downX = 0, downY = 0, pinGrab = false, lookDrag = false;
  canvas.addEventListener('pointerdown', (e) => {
    audio.ensure();
    downX = e.clientX; downY = e.clientY; lookDrag = true;
    if (fsm.current === TrainerState.PullPin && !fire?.finished) {
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      pinGrab = ext.tryGrabPin(raycaster);
    }
  });
  addEventListener('pointermove', (e) => {
    if (pinGrab) {
      ext.dragPin(e.clientX - downX, camera);
      downX = e.clientX;
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
  if (await ARSession.xrSupported()) {
    $('btnXR').classList.remove('hidden');
    $('btnXR').addEventListener('click', async () => {
      try {
        audio.ensure();
        await session.enterXR(() => ui.setMode('sim'));
        overlay.classList.add('hidden');
        ui.setMode('xr');
      } catch (err) {
        alert('Could not start AR: ' + err.message + '\nUse Simulation mode instead.');
      }
    });
  } else {
    $('xrNote').textContent = 'AR (WebXR) not available here — use Simulation. (Android Chrome + HTTPS required for real AR.)';
  }
  if (!window.isSecureContext) $('xrNote').textContent = '⚠️ Not a secure context — serve over HTTPS or localhost.';

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
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
    if (fire && !fire.finished && (fsm.current === 'SqueezeLever' || fsm.current === 'SweepMotion')) {
      const hintEl = $('hint');
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
          `hp=${fire ? fire.health.toFixed(0) : '-'} press=${ext.pressure01.toFixed(2)}`;
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
