// SweepAndCoverageTracker.cs — Gyro yaw-rate gating + 3-zone base coverage + damage calculation.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace PASS.Training
{
    public enum BaseZone { None, Left, Center, Right }

    /// <summary>
    /// Damage is granted ONLY when all three hold:
    ///  1) spray particles touch FireBase (FireHazard calls RegisterSprayHit),
    ///  2) nozzle is sweeping: gyro yaw rate in [minSweepRate, maxSweepRate],
    ///  3) Left+Center+Right all hit consecutively within a sliding window.
    /// Attach next to ExtinguisherController (auto-wires if refs missing).
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SweepAndCoverageTracker : MonoBehaviour
    {
        [Header("Wiring")]
        [SerializeField] private ExtinguisherController controller;
        [SerializeField] private Transform fireRoot; // set when fire spawns (ARPlacementManager event)

        [Header("Sweep Gate (gyro yaw)")]
        [Tooltip("Below this the user is static-holding; above it they are shaking.")]
        [SerializeField] private float minSweepRateRadS = 0.4f;
        [SerializeField] private float maxSweepRateRadS = 2.0f;
        [Tooltip("Editor fallback when no gyro exists: derive yaw rate from nozzle rotation.")]
        [SerializeField] private bool useNozzleFallbackWhenNoGyro = true;

        [Header("Coverage")]
        [SerializeField] private float coverageWindowS = 2.5f;
        [SerializeField] private float baseHalfWidthM = 0.45f;

        [Header("Damage")]
        [SerializeField] private float damagePerCoveredSecond = 25f;

        public bool IsSweepingValid { get; private set; }
        public float CurrentYawRate { get; private set; }
        public bool CoverageComplete { get; private set; }

        public event Action<bool, float> OnSweepStateChanged; // (valid, yawRate)
        public event Action<BaseZone> OnZoneHit;
        public event Action OnCoverageComplete;

        private readonly Queue<(BaseZone zone, float time)> _recentHits = new();
        private readonly HashSet<BaseZone> _windowZones = new();
        private Quaternion _lastNozzleRot;
        private bool _gyroEnabled;
        private bool _lastValid;

        private void Awake()
        {
            if (controller == null) controller = GetComponent<ExtinguisherController>();
            if (controller == null) controller = FindFirstObjectByType<ExtinguisherController>();
        }

        private void OnEnable()
        {
            var placement = FindFirstObjectByType<ARPlacementManager>();
            if (placement != null) placement.OnFirePlaced += HandleFirePlaced;
            TryEnableGyro();
            if (controller != null && controller.TryGetComponent(out Transform t))
                _lastNozzleRot = t.rotation;
        }

        private void OnDisable()
        {
            var placement = FindFirstObjectByType<ARPlacementManager>();
            if (placement != null) placement.OnFirePlaced -= HandleFirePlaced;
            if (_gyroEnabled)
            {
#if UNITY_ANDROID || UNITY_IOS
                Input.gyro.enabled = false;
#endif
                _gyroEnabled = false;
            }
        }

        private void TryEnableGyro()
        {
#if UNITY_ANDROID || UNITY_IOS
            if (SystemInfo.supportsGyroscope)
            {
                Input.gyro.enabled = true;
                Input.gyro.updateInterval = 1f / 60f;
                _gyroEnabled = true;
            }
#endif
        }

        private void HandleFirePlaced(GameObject fire)
        {
            if (fire != null) fireRoot = fire.transform;
            _recentHits.Clear();
            _windowZones.Clear();
            CoverageComplete = false;
        }

        private void Update()
        {
            float yaw = ReadYawRate();
            CurrentYawRate = yaw;
            IsSweepingValid = Mathf.Abs(yaw) >= minSweepRateRadS && Mathf.Abs(yaw) <= maxSweepRateRadS;

            PruneWindow();

            if (IsSweepingValid != _lastValid)
            {
                _lastValid = IsSweepingValid;
                OnSweepStateChanged?.Invoke(IsSweepingValid, yaw);
            }
        }

        private float ReadYawRate()
        {
#if UNITY_ANDROID || UNITY_IOS
            if (_gyroEnabled) return Input.gyro.rotationRateUnbiased.y;
#endif
            // Editor / gyro-less fallback: yaw angular velocity of the nozzle (or this transform).
            Transform refT = controller != null ? controller.transform : transform;
            Quaternion now = refT.rotation;
            Quaternion delta = now * Quaternion.Inverse(_lastNozzleRot);
            _lastNozzleRot = now;
            delta.ToAngleAxis(out float angleDeg, out Vector3 axis);
            if (angleDeg > 180f) angleDeg -= 360f;
            float yawDeg = angleDeg * Mathf.Abs(axis.y);
            return yawDeg * Mathf.Deg2Rad / Mathf.Max(Time.deltaTime, 1e-4f);
        }

        /// <summary>
        /// Called by FireHazard.OnParticleCollision with the particle impact point.
        /// Returns damage to apply THIS call (0 unless sweeping + aiming + coverage hold).
        /// </summary>
        public float RegisterSprayHit(Vector3 worldPoint)
        {
            if (controller == null || !controller.IsSprayActive) return 0f;
            if (!controller.IsAimingAtBase) return 0f;
            if (!IsSweepingValid) return 0f;

            BaseZone zone = ClassifyZone(worldPoint);
            if (zone == BaseZone.None) return 0f;

            _recentHits.Enqueue((zone, Time.time));
            OnZoneHit?.Invoke(zone);
            PruneWindow();

            if (_windowZones.Count >= 3)
            {
                if (!CoverageComplete)
                {
                    CoverageComplete = true;
                    OnCoverageComplete?.Invoke();
                }
                // Continuous damage while the 3-zone sweep is maintained.
                return damagePerCoveredSecond * Time.deltaTime;
            }
            return 0f;
        }

        private BaseZone ClassifyZone(Vector3 worldPoint)
        {
            if (fireRoot == null)
            {
                var fire = FindFirstObjectByType<FireHazard>();
                if (fire != null) fireRoot = fire.transform;
                else return BaseZone.Center; // single-zone fallback, still gated by sweep+aim
            }
            Vector3 local = fireRoot.InverseTransformPoint(worldPoint);
            float third = baseHalfWidthM * 2f / 3f;
            if (local.x < -third / 2f) return BaseZone.Left;
            if (local.x > third / 2f) return BaseZone.Right;
            return BaseZone.Center;
        }

        private void PruneWindow()
        {
            while (_recentHits.Count > 0 && Time.time - _recentHits.Peek().time > coverageWindowS)
                _recentHits.Dequeue();
            _windowZones.Clear();
            foreach (var (zone, _) in _recentHits)
                _windowZones.Add(zone);
            if (_windowZones.Count < 3) CoverageComplete = false;
        }
    }
}
