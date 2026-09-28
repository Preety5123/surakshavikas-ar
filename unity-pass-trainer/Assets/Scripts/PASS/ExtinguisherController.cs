// ExtinguisherController.cs — Lever kinematics, pressure, spray particles, nozzle aim raycast.
// Attach to the Extinguisher root. Wire a UI hold-button to SqueezeButton (below) or call SetSqueezing directly.
using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace PASS.Training
{
    [DisallowMultipleComponent]
    public sealed class ExtinguisherController : MonoBehaviour
    {
        [Header("Lever Kinematics")]
        [SerializeField] private Transform leverPivot;
        [SerializeField] private float squeezedAngleDeg = 15f;
        [SerializeField] private float leverLerpSpeed = 8f;

        [Header("Nozzle & Aiming")]
        [SerializeField] private Transform nozzleTip;
        [SerializeField] private float aimRangeM = 10f;
        [SerializeField] private LayerMask aimMask = ~0;

        [Header("Spray")]
        [SerializeField] private ParticleSystem sprayParticles;
        [SerializeField] private AudioSource sprayLoopSource;
        [SerializeField] private float totalPressureSeconds = 12f;

        [Header("Reticle / Guidance")]
        [SerializeField] private Renderer reticleRenderer;
        [SerializeField] private Color aimGoodColor = Color.green;
        [SerializeField] private Color aimHighColor = Color.red;
        [SerializeField] private Color aimNoneColor = Color.white;

        public bool IsSqueezing { get; private set; }
        public bool IsAimingAtBase { get; private set; }
        public bool IsAimingAtUpper { get; private set; }
        public float Pressure01 => Mathf.Clamp01(_pressureLeft / totalPressureSeconds);
        public float PressureLeft => _pressureLeft;
        public string AimHint { get; private set; } = "Aim at the fire.";

        /// <summary>Aimed-at-base frames / total spray frames — consumed by FireHazard metrics.</summary>
        public int SprayFrames { get; private set; }
        public int AimedSprayFrames { get; private set; }
        public float AimAccuracy => SprayFrames == 0 ? 0f : (float)AimedSprayFrames / SprayFrames;

        public event Action<bool> OnSqueezeChanged;
        public event Action<bool, string> OnAimChanged; // (isAtBase, hint)

        private float _pressureLeft;
        private Quaternion _leverRest;
        private bool _spraying;
        private bool _failed;
        private ExtinguisherFSM _fsm;

        private void Awake()
        {
            _fsm = FindFirstObjectByType<ExtinguisherFSM>();
            _pressureLeft = totalPressureSeconds;
            if (leverPivot != null) _leverRest = leverPivot.localRotation;
            else Debug.LogError("[Extinguisher] Lever pivot not assigned.", this);
            if (nozzleTip == null) Debug.LogError("[Extinguisher] Nozzle tip not assigned.", this);
            if (sprayParticles != null) sprayParticles.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            if (sprayLoopSource != null) { sprayLoopSource.loop = true; sprayLoopSource.playOnAwake = false; }
        }

        private void OnEnable()
        {
            if (_fsm == null) _fsm = FindFirstObjectByType<ExtinguisherFSM>();
        }

        /// <summary>Called by UI hold-button (IPointerDown/Up) or hardware trigger.</summary>
        public void SetSqueezing(bool squeeze)
        {
            if (_failed) squeeze = false;
            // Defensive: lever locked until pin pulled (FSM gates spray too).
            if (squeeze && _fsm != null && !_fsm.LeverUnlocked)
            {
                Debug.LogWarning("[Extinguisher] Squeeze blocked — pin not pulled.", this);
                return;
            }
            if (IsSqueezing == squeeze) return;
            IsSqueezing = squeeze;
            OnSqueezeChanged?.Invoke(squeeze);
            if (squeeze) _fsm?.NotifySqueezeStarted();
        }

        private void Update()
        {
            UpdateAimRaycast();
            UpdateLeverVisual();
            UpdateSpray(Time.deltaTime);
        }

        // ---------- Aiming ----------

        private void UpdateAimRaycast()
        {
            bool wasBase = IsAimingAtBase;
            string wasHint = AimHint;
            IsAimingAtBase = false;
            IsAimingAtUpper = false;

            if (nozzleTip != null)
            {
                Ray ray = new(nozzleTip.position, nozzleTip.forward);
                Debug.DrawRay(ray.origin, ray.direction * aimRangeM, Color.yellow);
                if (Physics.Raycast(ray, out RaycastHit hit, aimRangeM, aimMask, QueryTriggerInteraction.Collide))
                {
                    if (hit.collider.CompareTag("FireBase"))
                    {
                        IsAimingAtBase = true;
                        AimHint = "Good — on the base! Sweep side to side.";
                        _fsm?.NotifyAimLocked();
                    }
                    else if (hit.collider.CompareTag("FireUpper"))
                    {
                        IsAimingAtUpper = true;
                        AimHint = "Aim lower at the base of the fire!";
                    }
                    else
                    {
                        AimHint = "Aim at the base of the fire.";
                    }
                }
                else
                {
                    AimHint = "Aim at the base of the fire.";
                }
            }

            if (reticleRenderer != null)
            {
                Color c = IsAimingAtBase ? aimGoodColor : IsAimingAtUpper ? aimHighColor : aimNoneColor;
                if (reticleRenderer.material != null && reticleRenderer.material.HasProperty("_Color"))
                    reticleRenderer.material.color = c;
            }

            if (wasBase != IsAimingAtBase || wasHint != AimHint)
                OnAimChanged?.Invoke(IsAimingAtBase, AimHint);
        }

        // ---------- Lever / spray ----------

        private void UpdateLeverVisual()
        {
            if (leverPivot == null) return;
            Quaternion target = IsSqueezing
                ? _leverRest * Quaternion.Euler(squeezedAngleDeg, 0f, 0f)
                : _leverRest;
            leverPivot.localRotation = Quaternion.Slerp(leverPivot.localRotation, target, Time.deltaTime * leverLerpSpeed);
        }

        private void UpdateSpray(float dt)
        {
            bool wantSpray = IsSqueezing
                && _fsm != null && _fsm.CanSpray
                && _pressureLeft > 0f && !_failed;

            if (wantSpray)
            {
                _pressureLeft = Mathf.Max(0f, _pressureLeft - dt);
                SprayFrames++;
                if (IsAimingAtBase) AimedSprayFrames++;
            }

            if (wantSpray != _spraying)
            {
                _spraying = wantSpray;
                if (sprayParticles != null)
                {
                    if (wantSpray) sprayParticles.Play();
                    else sprayParticles.Stop(true, ParticleSystemStopBehavior.StopEmitting);
                }
                if (sprayLoopSource != null)
                {
                    if (wantSpray && !sprayLoopSource.isPlaying) sprayLoopSource.Play();
                    if (!wantSpray && sprayLoopSource.isPlaying) sprayLoopSource.Stop();
                }
            }

            // Out of agent — fail only if the fire survived.
            if (_pressureLeft <= 0f && !_failed)
            {
                _failed = true;
                SetSqueezing(false);
                var fire = FindFirstObjectByType<FireHazard>();
                if (fire == null || fire.Health01 > 0f)
                    _fsm?.NotifyPressureEmpty($"pressure=0 health={(fire != null ? fire.Health01 : -1f):F2}");
            }
        }

        public bool IsSprayActive => _spraying;

        public void ResetController()
        {
            _pressureLeft = totalPressureSeconds;
            _failed = false;
            SprayFrames = 0;
            AimedSprayFrames = 0;
            SetSqueezing(false);
        }
    }

    /// <summary>
    /// On-screen hold button: PointerDown = squeeze, PointerUp/Exit = release.
    /// Attach to a Unity UI Button/Image. Assign controller in Inspector.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SqueezeButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        [SerializeField] private ExtinguisherController controller;

        private void Awake()
        {
            if (controller == null) controller = FindFirstObjectByType<ExtinguisherController>();
        }

        public void OnPointerDown(PointerEventData eventData) => controller?.SetSqueezing(true);
        public void OnPointerUp(PointerEventData eventData) => controller?.SetSqueezing(false);
        public void OnPointerExit(PointerEventData eventData) => controller?.SetSqueezing(false);
    }
}
