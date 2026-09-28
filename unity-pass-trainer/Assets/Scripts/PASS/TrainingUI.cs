// TrainingUI.cs — Thin event-glue between training systems and uGUI.
// Built + wired automatically by ProjectSetup. No gameplay logic here.
using UnityEngine;
using UnityEngine.UI;

namespace PASS.Training
{
    [DisallowMultipleComponent]
    public sealed class TrainingUI : MonoBehaviour
    {
        [Header("Panels & Texts (auto-wired by setup)")]
        [SerializeField] private GameObject proximityWarning;
        [SerializeField] private Text proximityText;
        [SerializeField] private Text aimHintText;
        [SerializeField] private Slider healthSlider;
        [SerializeField] private Slider pinSlider;
        [SerializeField] private Slider pressureSlider;
        [SerializeField] private GameObject squeezeButton;
        [SerializeField] private GameObject successPanel;
        [SerializeField] private Text successMetricsText;
        [SerializeField] private GameObject failPanel;

        private ARPlacementManager _placement;
        private ExtinguisherController _controller;
        private SweepAndCoverageTracker _tracker;
        private FireHazard _fire;
        private ExtinguisherFSM _fsm;
        private SafetyPinPuller _pin;

        private void Awake()
        {
            _fsm = FindFirstObjectByType<ExtinguisherFSM>();
            _placement = FindFirstObjectByType<ARPlacementManager>();
            _controller = FindFirstObjectByType<ExtinguisherController>();
            _tracker = FindFirstObjectByType<SweepAndCoverageTracker>();
        }

        private void OnEnable()
        {
            if (_placement != null)
            {
                _placement.OnFirePlaced += HandleFirePlaced;
                _placement.OnProximityChanged += HandleProximity;
            }
            if (_controller != null) _controller.OnAimChanged += HandleAim;
            if (_fsm != null) _fsm.OnStateChanged += HandleState;
        }

        private void OnDisable()
        {
            if (_placement != null)
            {
                _placement.OnFirePlaced -= HandleFirePlaced;
                _placement.OnProximityChanged -= HandleProximity;
            }
            if (_controller != null) _controller.OnAimChanged -= HandleAim;
            if (_fsm != null) _fsm.OnStateChanged -= HandleState;
            if (_fire != null)
            {
                _fire.OnHealthChanged -= HandleHealth;
                _fire.OnExtinguished -= HandleSuccess;
            }
            if (_pin != null) _pin.OnPullProgress -= HandlePin;
        }

        private void Update()
        {
            // Lazy-bind pin (spawns with extinguisher) + live pressure readout.
            if (_pin == null)
            {
                _pin = FindFirstObjectByType<SafetyPinPuller>();
                if (_pin != null) _pin.OnPullProgress += HandlePin;
            }
            if (_controller != null && pressureSlider != null)
                pressureSlider.value = _controller.Pressure01;
        }

        private void HandleFirePlaced(GameObject fire)
        {
            _fire = fire != null ? fire.GetComponent<FireHazard>() : null;
            if (_fire != null)
            {
                _fire.OnHealthChanged += HandleHealth;
                _fire.OnExtinguished += HandleSuccess;
                HandleHealth(_fire.Health01);
            }
            if (healthSlider != null) healthSlider.gameObject.SetActive(true);
        }

        private void HandleProximity(bool tooClose, float distanceM)
        {
            if (proximityWarning != null) proximityWarning.SetActive(tooClose);
            if (proximityText != null && tooClose)
                proximityText.text = $"Too close! Step back to a safe operating distance (6–8 ft). [{distanceM:F1} m]";
        }

        private void HandleAim(bool atBase, string hint)
        {
            if (aimHintText != null) aimHintText.text = hint;
        }

        private void HandleHealth(float h01)
        {
            if (healthSlider != null) healthSlider.value = h01;
        }

        private void HandlePin(float p01)
        {
            if (pinSlider != null) pinSlider.value = p01;
        }

        private void HandleState(TrainerState prev, TrainerState next)
        {
            if (squeezeButton != null)
                squeezeButton.SetActive(next is TrainerState.SqueezeLever or TrainerState.SweepMotion);
            if (failPanel != null)
                failPanel.SetActive(next == TrainerState.FailedOut);
            if (next == TrainerState.Extinguished && successPanel != null)
                successPanel.SetActive(true);
        }

        private void HandleSuccess(FireHazard.RunMetrics m)
        {
            if (successPanel != null) successPanel.SetActive(true);
            if (successMetricsText != null)
                successMetricsText.text =
                    $"Fire Extinguished!\nTime Taken: {m.timeTakenS:F1}s\n" +
                    $"Pressure Remaining: {m.pressureRemaining01:P0}\nAim Accuracy: {m.aimAccuracy01:P0}";
        }
    }
}
