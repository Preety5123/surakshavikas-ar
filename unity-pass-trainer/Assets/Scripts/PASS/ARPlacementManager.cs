// ARPlacementManager.cs — Plane tracking, tap-to-place, safety proximity.
// Requires: ARSession, ARPlaneManager (horizontal only), ARRaycastManager on same rig.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace PASS.Training
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(ARRaycastManager))]
    public sealed class ARPlacementManager : MonoBehaviour
    {
        [Header("AR References")]
        [SerializeField] private ARPlaneManager planeManager;
        [SerializeField] private ARRaycastManager raycastManager;
        [SerializeField] private Camera arCamera;

        [Header("Prefabs & Anchors")]
        [SerializeField] private GameObject fireHazardPrefab;
        [SerializeField] private GameObject extinguisherViewPrefab;
        [Tooltip("If true, extinguisher is parented to camera with offset. If false, spawned in world for pickup.")]
        [SerializeField] private bool attachExtinguisherToCamera = true;
        [SerializeField] private Vector3 cameraLocalOffset = new(0.28f, -0.26f, 0.55f);

        [Header("Safety Proximity (6-8 ft operating distance)")]
        [SerializeField] private float minSafeDistanceM = 1.8f;
        [SerializeField] private float reWarnCooldownS = 1.0f;

        public GameObject SpawnedFire { get; private set; }
        public GameObject SpawnedExtinguisher { get; private set; }
        public bool IsPlaced => SpawnedFire != null;
        public bool IsTooClose { get; private set; }

        public event Action<GameObject> OnFirePlaced;
        /// <summary>bool tooClose, float distanceM</summary>
        public event Action<bool, float> OnProximityChanged;

        private readonly List<ARRaycastHit> _hits = new();
        private float _lastWarnTime = -10f;
        private bool _lastTooCloseSent;

        private void Awake()
        {
            if (raycastManager == null) raycastManager = GetComponent<ARRaycastManager>();
            if (arCamera == null) arCamera = Camera.main;
        }

        private void OnEnable()
        {
            if (planeManager != null)
                planeManager.planesChanged += OnPlanesChanged;
        }

        private void OnDisable()
        {
            if (planeManager != null)
                planeManager.planesChanged -= OnPlanesChanged;
        }

        private void Start()
        {
            // Enforce horizontal-only detection.
            if (planeManager != null && planeManager.requestedDetectionMode != PlaneDetectionMode.Horizontal)
            {
                Debug.Log("[ARPlacement] Forcing PlaneDetectionMode.Horizontal.");
                planeManager.requestedDetectionMode = PlaneDetectionMode.Horizontal;
            }
            if (fireHazardPrefab == null) Debug.LogError("[ARPlacement] FireHazard prefab not assigned.", this);
            if (arCamera == null) Debug.LogError("[ARPlacement] AR Camera not assigned/found.", this);
        }

        private void OnPlanesChanged(ARPlanesChangedEventArgs args)
        {
            // Defensive: disable any vertical planes some providers emit before mode applies.
            foreach (var p in args.added)
                if (p.alignment != PlaneAlignment.HorizontalUp)
                    p.gameObject.SetActive(false);
            foreach (var p in args.updated)
                if (p.alignment != PlaneAlignment.HorizontalUp && p.gameObject.activeSelf)
                    p.gameObject.SetActive(false);
        }

        private void Update()
        {
            if (!IsPlaced && TryGetTapScreenPoint(out Vector2 screenPoint))
                TryPlace(screenPoint);

            if (IsPlaced)
                UpdateProximity();
        }

        // ---------- Placement ----------

        private bool TryGetTapScreenPoint(out Vector2 point)
        {
            point = default;
            if (ExtinguisherFSM.Instance != null &&
                ExtinguisherFSM.Instance.CurrentState != TrainerState.Placement)
                return false;
            if (IsPlaced) return false;

#if ENABLE_INPUT_SYSTEM
            if (Touchscreen.current == null) return false;
            // Primary touch began this frame.
            if (Touchscreen.current.primaryTouch.press.wasPressedThisFrame)
            {
                point = Touchscreen.current.primaryTouch.position.ReadValue();
                return true;
            }
            return false;
#else
            if (Input.touchCount > 0 && Input.GetTouch(0).phase == TouchPhase.Began)
            {
                point = Input.GetTouch(0).position;
                return true;
            }
            return false;
#endif
        }

        private void TryPlace(Vector2 screenPoint)
        {
            if (raycastManager == null || fireHazardPrefab == null || arCamera == null) return;
            if (!raycastManager.Raycast(screenPoint, _hits, TrackableType.PlaneWithinPolygon))
                return;

            Pose pose = _hits[0].pose;
            SpawnedFire = Instantiate(fireHazardPrefab, pose.position, Quaternion.identity);

            // Anchor stability: keep world-locked, face user.
            Vector3 toCam = arCamera.transform.position - pose.position;
            toCam.y = 0f;
            if (toCam.sqrMagnitude > 0.001f)
                SpawnedFire.transform.rotation = Quaternion.LookRotation(toCam.normalized, Vector3.up);

            SpawnExtinguisher();
            SetPlanesVisible(false);

            OnFirePlaced?.Invoke(SpawnedFire);
            ExtinguisherFSM.Instance?.NotifyPlaced();
        }

        private void SpawnExtinguisher()
        {
            if (extinguisherViewPrefab == null) return;
            SpawnedExtinguisher = Instantiate(extinguisherViewPrefab);
            if (attachExtinguisherToCamera && arCamera != null)
            {
                SpawnedExtinguisher.transform.SetParent(arCamera.transform, false);
                SpawnedExtinguisher.transform.localPosition = cameraLocalOffset;
                SpawnedExtinguisher.transform.localRotation = Quaternion.identity;
            }
            else if (SpawnedFire != null)
            {
                // World pickup: 0.6 m in front of fire, on the ground.
                Vector3 p = SpawnedFire.transform.position + SpawnedFire.transform.forward * 0.6f;
                SpawnedExtinguisher.transform.SetPositionAndRotation(p, Quaternion.identity);
            }
        }

        private void SetPlanesVisible(bool visible)
        {
            if (planeManager == null) return;
            foreach (var plane in planeManager.trackables)
                plane.gameObject.SetActive(visible);
        }

        // ---------- Proximity ----------

        private void UpdateProximity()
        {
            if (arCamera == null || SpawnedFire == null) return;
            float d = Vector3.Distance(arCamera.transform.position, SpawnedFire.transform.position);
            IsTooClose = d < minSafeDistanceM;

            if (IsTooClose != _lastTooCloseSent || (IsTooClose && Time.time - _lastWarnTime > reWarnCooldownS))
            {
                _lastTooCloseSent = IsTooClose;
                _lastWarnTime = Time.time;
                OnProximityChanged?.Invoke(IsTooClose, d);
            }
        }

        public float DistanceToFire()
        {
            if (arCamera == null || SpawnedFire == null) return float.PositiveInfinity;
            return Vector3.Distance(arCamera.transform.position, SpawnedFire.transform.position);
        }
    }
}
