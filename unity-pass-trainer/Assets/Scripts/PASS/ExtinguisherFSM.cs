// ExtinguisherFSM.cs — Central state controller for P.A.S.S. training.
// Unity 2022.3 LTS+, AR Foundation, URP. New Input System compatible (no direct input here).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace PASS.Training
{
    /// <summary>
    /// Strict finite-state controller. No skipping: each transition is explicitly whitelisted.
    /// Other components NEVER set state directly — they call Notify* methods, FSM validates.
    /// </summary>
    public enum TrainerState
    {
        Placement,
        PullPin,
        AimAtBase,
        SqueezeLever,
        SweepMotion,
        Extinguished,
        FailedOut
    }

    [DisallowMultipleComponent]
    public sealed class ExtinguisherFSM : MonoBehaviour
    {
        public static ExtinguisherFSM Instance { get; private set; }

        [Header("Debug")]
        [SerializeField] private TrainerState currentState = TrainerState.Placement;

        public TrainerState CurrentState => currentState;

        /// <summary>Fired on every legal transition (prev, next).</summary>
        public event Action<TrainerState, TrainerState> OnStateChanged;
        /// <summary>Fired when an illegal progression is attempted (for UI guidance / analytics).</summary>
        public event Action<TrainerState, string> OnIllegalTransition;

        private static readonly Dictionary<TrainerState, HashSet<TrainerState>> Allowed =
            new()
            {
                { TrainerState.Placement,    new HashSet<TrainerState>{ TrainerState.PullPin } },
                { TrainerState.PullPin,      new HashSet<TrainerState>{ TrainerState.AimAtBase } },
                { TrainerState.AimAtBase,    new HashSet<TrainerState>{ TrainerState.SqueezeLever } },
                { TrainerState.SqueezeLever, new HashSet<TrainerState>{ TrainerState.SweepMotion } },
                { TrainerState.SweepMotion,  new HashSet<TrainerState>{ TrainerState.Extinguished, TrainerState.FailedOut } },
                { TrainerState.Extinguished, new HashSet<TrainerState>() },
                { TrainerState.FailedOut,    new HashSet<TrainerState>() },
            };

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Debug.LogWarning("[FSM] Duplicate ExtinguisherFSM destroyed.", this);
                Destroy(this);
                return;
            }
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        // ---------- Internal guarded transition ----------

        private bool TryTransition(TrainerState next, string context = "")
        {
            if (currentState == next) return true;
            if (currentState is TrainerState.Extinguished or TrainerState.FailedOut)
            {
                OnIllegalTransition?.Invoke(currentState, $"Terminal state; cannot move to {next}. {context}");
                return false;
            }
            if (Allowed.TryGetValue(currentState, out var set) && set.Contains(next))
            {
                var prev = currentState;
                currentState = next;
                OnStateChanged?.Invoke(prev, next);
                Debug.Log($"[FSM] {prev} -> {next} {context}");
                return true;
            }
            OnIllegalTransition?.Invoke(currentState, $"Blocked {currentState} -> {next}. {context}");
            Debug.LogWarning($"[FSM] Illegal transition {currentState} -> {next}. {context}", this);
            return false;
        }

        // ---------- Public notify API (called by subsystem scripts) ----------

        /// <summary>Called by ARPlacementManager after FireHazard is spawned & anchored.</summary>
        public bool NotifyPlaced() => TryTransition(TrainerState.PullPin, "(fire placed)");

        /// <summary>Called by SafetyPinPuller once pin passes 5cm threshold.</summary>
        public bool NotifyPinPulled() => TryTransition(TrainerState.AimAtBase, "(pin extracted)");

        /// <summary>Called by ExtinguisherController on first valid FireBase aim lock.</summary>
        public bool NotifyAimLocked()
        {
            if (currentState == TrainerState.AimAtBase) return TryTransition(TrainerState.SqueezeLever, "(aim locked)");
            return false; // idempotent — not an error to keep aiming in later states
        }

        /// <summary>Called by ExtinguisherController on first squeeze while state == SqueezeLever.</summary>
        public bool NotifySqueezeStarted()
        {
            if (currentState == TrainerState.SqueezeLever) return TryTransition(TrainerState.SweepMotion, "(lever squeezed)");
            return false;
        }

        /// <summary>Called by FireHazard when health reaches 0.</summary>
        public bool NotifyExtinguished() => TryTransition(TrainerState.Extinguished, "(fire out)");

        /// <summary>Called by ExtinguisherController when pressure hits 0 with fire still alive,
        /// or by any timeout/fail safeguard.</summary>
        public bool NotifyPressureEmpty(string reason = "")
        {
            if (currentState is TrainerState.SqueezeLever or TrainerState.SweepMotion)
                return TryTransition(TrainerState.FailedOut, $"(out of pressure) {reason}");
            return false;
        }

        /// <summary>Full reset for replay (keeps scene objects; callers reset their own values).</summary>
        public void ResetTo(TrainerState state = TrainerState.Placement)
        {
            var prev = currentState;
            currentState = state;
            OnStateChanged?.Invoke(prev, state);
        }

        // ---------- Guards for UI gating ----------

        public bool LeverUnlocked => currentState >= TrainerState.AimAtBase
            && currentState is not TrainerState.Placement and not TrainerState.PullPin;
        public bool CanSpray => currentState is TrainerState.SqueezeLever or TrainerState.SweepMotion;
    }
}
