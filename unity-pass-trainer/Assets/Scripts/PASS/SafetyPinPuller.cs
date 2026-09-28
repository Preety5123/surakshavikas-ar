// SafetyPinPuller.cs — Touch-drag pin along local extraction axis, 5cm breakaway threshold.
using System;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace PASS.Training
{
    /// <summary>
    /// Pin must be a child GameObject with its own Collider.
    /// Drag is projected onto <see cref="extractionAxis"/> (local space) so off-axis pulls slide, not yank.
    /// Past <see cref="breakawayDistanceM"/> (0.05 m) the pin detaches, gets a Rigidbody impulse,
    /// plays a metallic cue, and unlocks the lever via FSM.
    /// Attach to the PIN object.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Collider))]
    public sealed class SafetyPinPuller : MonoBehaviour
    {
        [Header("Pin Rig")]
        [Tooltip("Local axis the pin slides out along (usually +X or +Y of pin).")]
        [SerializeField] private Vector3 extractionAxis = Vector3.right;
        [SerializeField] private float breakawayDistanceM = 0.05f;
        [SerializeField] private float dragGain = 1.0f;
        [SerializeField] private float maxDragDistanceM = 0.12f;

        [Header("Breakaway Physics")]
        [SerializeField] private float tossImpulse = 1.2f;
        [SerializeField] private Vector3 tossTorque = new(4f, 6f, 3f);

        [Header("Audio")]
        [SerializeField] private AudioSource audioSource;
        [SerializeField] private AudioClip metallicPullClip;

        [Header("Camera (drag ray)")]
        [SerializeField] private Camera rayCamera;

        public bool IsPulled { get; private set; }
        public float PullProgress01 => Mathf.Clamp01(_dragDistance / breakawayDistanceM);

        public event Action OnPinPulled;
        public event Action<float> OnPullProgress;

        private Vector3 _initialLocalPos;
        private float _dragDistance;
        private bool _dragging;
        private Plane _dragPlane;
        private Vector3 _lastWorldPoint;
        private Collider _collider;

        private void Awake()
        {
            _collider = GetComponent<Collider>();
            _initialLocalPos = transform.localPosition;
            if (rayCamera == null) rayCamera = Camera.main;
            if (extractionAxis.sqrMagnitude < 1e-6f) extractionAxis = Vector3.right;
            extractionAxis.Normalize();
        }

        private void Update()
        {
            if (IsPulled) return;
            // Gate: pin only interactive during PullPin state.
            if (ExtinguisherFSM.Instance != null &&
                ExtinguisherFSM.Instance.CurrentState != TrainerState.PullPin)
            {
                if (_dragging) CancelDrag();
                return;
            }
            HandleTouch();
        }

        private void HandleTouch()
        {
#if ENABLE_INPUT_SYSTEM
            if (Touchscreen.current == null) return;
            var touch = Touchscreen.current.primaryTouch;
            Vector2 screen = touch.position.ReadValue();
            bool pressed = touch.press.isPressed;
            bool began = touch.press.wasPressedThisFrame;
            bool released = touch.press.wasReleasedThisFrame;
#else
            bool hasTouch = Input.touchCount > 0;
            Touch t = hasTouch ? Input.GetTouch(0) : default;
            Vector2 screen = hasTouch ? t.position : (Vector2)Input.mousePosition;
            bool pressed = hasTouch ? (t.phase == TouchPhase.Moved || t.phase == TouchPhase.Stationary) : Input.GetMouseButton(0);
            bool began = hasTouch ? t.phase == TouchPhase.Began : Input.GetMouseButtonDown(0);
            bool released = hasTouch ? (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled) : Input.GetMouseButtonUp(0);
#endif
            if (rayCamera == null) return;

            if (began)
            {
                var ray = rayCamera.ScreenPointToRay(screen);
                if (_collider.Raycast(ray, out RaycastHit hit, 10f))
                {
                    _dragging = true;
                    // Drag plane: through pin, facing camera — stable for finger slides.
                    _dragPlane = new Plane(-ray.direction, hit.point);
                    _lastWorldPoint = hit.point;
                }
            }
            else if (pressed && _dragging)
            {
                var ray = rayCamera.ScreenPointToRay(screen);
                if (_dragPlane.Raycast(ray, out float enter))
                {
                    Vector3 worldPoint = ray.GetPoint(enter);
                    Vector3 worldDelta = worldPoint - _lastWorldPoint;
                    _lastWorldPoint = worldPoint;

                    // Project world delta onto pin's local extraction axis (in world space).
                    Vector3 axisWorld = transform.parent != null
                        ? transform.parent.TransformDirection(extractionAxis)
                        : transform.TransformDirection(extractionAxis);
                    float along = Vector3.Dot(worldDelta, axisWorld.normalized) * dragGain;

                    // Only outward motion accumulates (no re-insertion exploits).
                    if (along > 0f)
                    {
                        _dragDistance = Mathf.Min(_dragDistance + along, maxDragDistanceM);
                        transform.localPosition = _initialLocalPos + extractionAxis * _dragDistance;
                        OnPullProgress?.Invoke(PullProgress01);
                        if (_dragDistance >= breakawayDistanceM)
                            BreakAway(axisWorld.normalized);
                    }
                }
            }
            else if (released && _dragging)
            {
                CancelDrag();
            }
        }

        private void CancelDrag()
        {
            _dragging = false;
            if (!IsPulled)
            {
                // Snap back for clear affordance that threshold wasn't reached.
                transform.localPosition = _initialLocalPos;
                _dragDistance = 0f;
                OnPullProgress?.Invoke(0f);
            }
        }

        private void BreakAway(Vector3 axisWorld)
        {
            IsPulled = true;
            _dragging = false;

            // Detach to world, enable tumbling physics.
            transform.SetParent(null, true);
            var rb = GetComponent<Rigidbody>();
            if (rb == null) rb = gameObject.AddComponent<Rigidbody>();
            rb.isKinematic = false;
            rb.useGravity = true;
            rb.AddForce((axisWorld + Vector3.up * 0.6f).normalized * tossImpulse, ForceMode.Impulse);
            rb.AddTorque(tossTorque, ForceMode.Impulse);

            // Auto-cleanup so the dropped pin doesn't litter the scene.
            Destroy(gameObject, 6f);

            if (audioSource != null && metallicPullClip != null)
                audioSource.PlayOneShot(metallicPullClip);

            OnPinPulled?.Invoke();
            ExtinguisherFSM.Instance?.NotifyPinPulled();
        }
    }
}
