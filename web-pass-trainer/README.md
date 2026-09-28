# Web P.A.S.S. Trainer (`web-pass-trainer`)

Zero-install, zero-asset AR fire-extinguisher trainer. Same drill as the Unity module:
Placement → PullPin → AimAtBase → SqueezeLever → SweepMotion → Extinguished / FailedOut.

**Stack:** Three.js (CDN, pinned) + WebXR (`immersive-ar`, hit-test) + WebAudio synth + ES modules. No build step.

## Layout
| Path | Role (mirrors Unity script) |
|---|---|
| `index.html` | Canvas + HUD (warning, hint, bars, squeeze, panels, start overlay) |
| `js/fsm.js` | `ExtinguisherFSM` — whitelisted transitions, events |
| `js/session.js` | `ARSession` (hit-test placement, XR camera) + `SimLook` (drag/gyro fallback) |
| `js/extinguisher.js` | Lever 15°, pin drag 5 cm + toss, spray particles, nozzle aim raycast, 12 s pressure |
| `js/sweep.js` | `SweepTracker` — camera-yaw rate 0.4–2.0 rad/s, L/C/R zones, 2.5 s window, 25 dps |
| `js/fire.js` | `FireHazard` — 100 HP, flame shrink / light dim / steam grow, impact intake, metrics |
| `js/particles.js` | CPU `ParticlePool` on `THREE.Points` (flames, smoke, steam, spray) |
| `js/audio.js` | `SynthAudio` — pin ping, spray loop, fire crackle (no audio files) |
| `js/ui.js` | `TrainingUI` — DOM glue; success saves to SurakshaVikas history (`svr`) |
| `js/main.js` | Bootstrap, wiring, 1.8 m proximity, game loop (`setAnimationLoop` for XR) |

## Run
```bash
cd web-pass-trainer
python3 -m http.server 8080   # or: npx serve .
```
- **Desktop / iPhone:** open `http://<laptop-ip>:8080` → **Simulation mode** (drag to look, tap floor to place; gyro button on mobile).
- **Real AR:** Android Chrome, **HTTPS** (or `http://localhost` via USB + `chrome://inspect` port forwarding) → **Enter AR** → move phone to detect a plane → tap to place fire.
- iOS Safari has no WebXR `immersive-ar` (Apple, 2026) → iPhones use Simulation mode with gyro look (permission button included).

## Drill
Tap floor → drag brass pin out → aim (reticle green = base, red = too high) → hold SQUEEZE → sweep phone side-to-side covering Left/Center/Right → metrics (time, pressure, aim %).

## Notes / limits
- Needs internet once (Three.js CDN). To go offline, vendor `three.module.js` locally and point the importmap at it.
- Sweep yaw is derived from camera rotation (== gyro on device), so spec rates apply in both modes.
- Matches brand + history keys of `mobile-app/web-preview.html`.
