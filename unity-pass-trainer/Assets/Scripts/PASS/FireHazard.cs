// FireHazard.cs — Health, visual/audio degradation, particle-collision intake, end-of-run metrics.
// Prefab layout: FireHazard (root)
//   ├─ FireBase  (flat Cylinder collider, tag "FireBase", layer with raycast)
//   └─ FireUpper (Capsule collider, tag "FireUpper")
// Particle Systems must have Collision: Enabled, Type=World, Mode=3D, Send Collision Messages = ON.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace PASS.Training
{
    [DisallowMultipleComponent]
    public sealed class FireHazard : MonoBehaviour
    {
        [Header("Health")]
        [SerializeField] private float maxHealth = 100f;
        [SerializeField] private float directSprayFallbackDps = 8f;

        [Header("FX")]
        [SerializeField] private ParticleSystem flameParticles;
        [SerializeField] private ParticleSystem smokeParticles;
        [SerializeField] private ParticleSystem steamParticles; // evaporative / powder cloud, grows as fire dies
        [SerializeField] private Light fireLight;
        [SerializeField] private float flameStartSize = 1.0f;
        [SerializeField] private float fireLightFull = 3.0f;

        [Header("Audio")]
        [SerializeField] private AudioSource fireLoopSource;

        [Header("Wiring (auto-found if empty)")]
        [SerializeField] private ExtinguisherController controller;
        [SerializeField] private SweepAndCoverageTracker sweepTracker;

        public float Health { get; private set; }
        public float Health01 => Mathf.Clamp01(Health / maxHealth);
        public bool IsOut => Health <= 0f;

        public float RunStartTime { get; private set; }
        public event Action<RunMetrics> OnExtinguished;
        public event Action<float> OnHealthChanged;

        private bool _finished;
        private readonly List<ParticleCollisionEvent> _collisionEvents = new(16);

        public struct RunMetrics
        {
            public float timeTakenS;
            public float pressureRemaining01;
            public float aimAccuracy01;
        }

        private void Awake()
        {
            Health = maxHealth;
            if (controller == null) controller = FindFirstObjectByType<ExtinguisherController>();
            if (sweepTracker == null) sweepTracker = FindFirstObjectByType<SweepAndCoverageTracker>();
            ValidateTags();
        }

        private void Start()
        {
            RunStartTime = Time.time;
            ApplyDegradation(1f);
            if (fireLoopSource != null && !fireLoopSource.isPlaying) fireLoopSource.Play();
        }

        private void ValidateTags()
        {
            var baseT = transform.Find("FireBase");
            var upperT = transform.Find("FireUpper");
            if (baseT != null && !baseT.CompareTag("FireBase"))
                Debug.LogWarning("[FireHazard] Child 'FireBase' must be tagged 'FireBase'.", baseT);
            if (upperT != null && !upperT.CompareTag("FireUpper"))
                Debug.LogWarning("[FireHazard] Child 'FireUpper' must be tagged 'FireUpper'.", upperT);
            if (baseT == null || upperT == null)
                Debug.LogWarning("[FireHazard] Expected children 'FireBase' and 'FireUpper' with distinct colliders.", this);
        }

        // ---------- Damage intake ----------

        /// <summary>
        /// Called by Unity particle collision. Spray particles must have
        /// Collision > Send Collision Messages enabled; this object needs a Collider.
        /// </summary>
        private void OnParticleCollision(GameObject other)
        {
            if (_finished || IsOut) return;
            if (controller == null || !controller.IsSprayActive) return;

            // Preferred path: exact particle impact points via collision events,
            // each classified into a base zone by the sweep tracker (which enforces
            // aim + sweep-rate + 3-zone coverage gates before granting damage).
            var ps = other != null ? other.GetComponent<ParticleSystem>() : null;
            if (ps != null && sweepTracker != null)
            {
                int n = ParticlePhysicsExtensions.GetCollisionEvents(ps, gameObject, _collisionEvents);
                float total = 0f;
                for (int i = 0; i < n; i++)
                    total += sweepTracker.RegisterSprayHit(_collisionEvents[i].intersection);
                if (total > 0f) ApplyDamage(total);
                return;
            }

            // Fallback (no tracker or legacy callers): proximity-based damage.
            float fallback = 0f;
            if (sweepTracker != null)
            {
                Vector3 point = transform.position;
                var baseCol = transform.Find("FireBase")?.GetComponent<Collider>();
                if (baseCol != null && other != null)
                    point = baseCol.ClosestPoint(other.transform.position);
                fallback = sweepTracker.RegisterSprayHit(point);
            }
            else if (controller.IsAimingAtBase)
            {
                fallback = directSprayFallbackDps * Time.deltaTime;
            }

            if (fallback > 0f) ApplyDamage(fallback);
        }

        public void ApplyDamage(float amount)
        {
            if (_finished || IsOut || amount <= 0f) return;
            Health = Mathf.Max(0f, Health - amount);
            ApplyDegradation(Health01);
            OnHealthChanged?.Invoke(Health01);
            if (IsOut) FinishExtinguished();
        }

        // ---------- Degradation feedback (100% -> 0%) ----------

        private void ApplyDegradation(float h01)
        {
            if (flameParticles != null)
            {
                var m = flameParticles.main;
                m.startSizeMultiplier = Mathf.Max(0.001f, flameStartSize * h01);
                // Optional: also fade emission rate.
                var em = flameParticles.emission;
                em.rateOverTimeMultiplier = Mathf.Max(0f, 40f * h01);
            }
            if (fireLight != null)
                fireLight.intensity = fireLightFull * h01;
            if (steamParticles != null)
            {
                var em = steamParticles.emission;
                em.rateOverTimeMultiplier = 5f + 45f * (1f - h01);
                if (!steamParticles.isPlaying) steamParticles.Play();
            }
        }

        private void FinishExtinguished()
        {
            _finished = true;
            if (flameParticles != null) flameParticles.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            if (smokeParticles != null) smokeParticles.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            if (fireLoopSource != null) fireLoopSource.Stop();
            if (fireLight != null) fireLight.intensity = 0f;

            var metrics = new RunMetrics
            {
                timeTakenS = Time.time - RunStartTime,
                pressureRemaining01 = controller != null ? controller.Pressure01 : 0f,
                aimAccuracy01 = controller != null ? controller.AimAccuracy : 0f,
            };
            OnExtinguished?.Invoke(metrics);
            ExtinguisherFSM.Instance?.NotifyExtinguished();
            Debug.Log($"[FireHazard] EXTINGUISHED t={metrics.timeTakenS:F1}s pressure={metrics.pressureRemaining01:P0} aim={metrics.aimAccuracy01:P0}");
        }
    }
}
