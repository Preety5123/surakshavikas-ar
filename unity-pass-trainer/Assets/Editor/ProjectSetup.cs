// ProjectSetup.cs — One-click builder for the AR P.A.S.S. training scene.
// Menu: PASS > Build Training Scene (Full Setup)
// Also invokable headless: Unity -batchmode -executeMethod PASS.Training.Editor.ProjectSetup.BuildFromCLI
// Requires packages in Packages/manifest.json (AR Foundation, URP, Input System).
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.UI;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using UnityEngine.XR.Management;
using UnityEditor.XR.Management;
using UnityEngine.Rendering.Universal;
using UnityEngine.InputSystem.UI;

namespace PASS.Training.Editor
{
    public static class ProjectSetup
    {
        private const string ScenePath = "Assets/Scenes/Main.unity";
        private const string FirePrefabPath = "Assets/Prefabs/FireHazard.prefab";
        private const string ExtPrefabPath = "Assets/Prefabs/Extinguisher.prefab";
        private const string PlanePrefabPath = "Assets/Prefabs/ARDefaultPlane.prefab";
        private const string UrpAssetPath = "Assets/Settings/PASS_URP.asset";
        private const string AppId = "com.surakshavikas.passtrainer";

        [MenuItem("PASS/Build Training Scene (Full Setup)")]
        public static void BuildAllFromMenu() => BuildAll();

        public static void BuildFromCLI() { BuildAll(); AssetDatabase.SaveAssets(); }

        public static void BuildAll()
        {
            EnsureFolders();
            EnsureTagsAndLayers();
            ConfigurePlayerSettings();
            ConfigureXRLoader();
            EnsureURP();
            var planePrefab = BuildPlanePrefab();
            var firePrefab = BuildFirePrefab();
            var extPrefab = BuildExtinguisherPrefab();
            BuildScene(planePrefab, firePrefab, extPrefab);
            Debug.Log("[PASS Setup] Done. Press Play on device (AR) or use AR Simulation. See README.");
        }

        // ---------- helpers ----------

        private static void EnsureFolders()
        {
            Directory.CreateDirectory("Assets/Scenes");
            Directory.CreateDirectory("Assets/Prefabs");
            Directory.CreateDirectory("Assets/Settings");
        }

        private static void SetRef(Object target, string field, Object value)
        {
            var so = new SerializedObject(target);
            var p = so.FindProperty(field);
            if (p == null) { Debug.LogWarning($"[PASS Setup] Field '{field}' not found on {target.GetType().Name}."); return; }
            p.objectReferenceValue = value;
            so.ApplyModifiedProperties();
        }

        private static Material Lit(Color c, float metallic = 0f, float smoothness = 0.4f)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var m = new Material(shader) { color = c };
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            return m;
        }

        private static Material TransparentPlaneMat()
        {
            var m = Lit(new Color(0.2f, 0.8f, 1f, 0.25f));
            if (m.HasProperty("_Surface")) m.SetFloat("_Surface", 1f); // transparent
            if (m.HasProperty("_Mode")) m.SetFloat("_Mode", 3f);
            m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = 3000;
            return m;
        }

        // ---------- project-level config ----------

        private static void EnsureTagsAndLayers()
        {
            var tagManager = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            var tags = tagManager.FindProperty("tags");
            foreach (var t in new[] { "FireBase", "FireUpper" })
            {
                bool found = false;
                for (int i = 0; i < tags.arraySize; i++)
                    if (tags.GetArrayElementAtIndex(i).stringValue == t) { found = true; break; }
                if (!found) { tags.InsertArrayElementAtIndex(tags.arraySize); tags.GetArrayElementAtIndex(tags.arraySize - 1).stringValue = t; }
            }
            var layers = tagManager.FindProperty("layers");
            if (layers.arraySize >= 9 && string.IsNullOrEmpty(layers.GetArrayElementAtIndex(8).stringValue))
                layers.GetArrayElementAtIndex(8).stringValue = "Fire";
            tagManager.ApplyModifiedProperties();
        }

        private static void ConfigurePlayerSettings()
        {
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, AppId);
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24; // ARCore minimum
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.companyName = "SurakshaVikas";
            PlayerSettings.productName = "AR PASS Trainer";
            PlayerSettings.bundleVersion = "1.0.0";
            PlayerSettings.Android.bundleVersionCode = 1;
        }

        private static void ConfigureXRLoader()
        {
            try
            {
                var general = XRGeneralSettingsPerBuildTarget.XRGeneralSettingsForBuildTarget(BuildTargetGroup.Android);
                if (general == null)
                {
                    // Create + persist the per-build-target settings object exactly like the XR Management UI does,
                    // then create the default per-platform entry (fresh containers have an empty target map).
                    Directory.CreateDirectory("Assets/XR/Settings");
                    var perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                    AssetDatabase.CreateAsset(perTarget, "Assets/XR/Settings/XRGeneralSettingsPerBuildTarget.asset");
                    AssetDatabase.SaveAssets();
                    EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, perTarget, true);
                    if (!perTarget.HasSettingsForBuildTarget(BuildTargetGroup.Android))
                        perTarget.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.Android);
                    EditorUtility.SetDirty(perTarget);
                    AssetDatabase.SaveAssets();
                    general = perTarget.SettingsForBuildTarget(BuildTargetGroup.Android);
                }
                if (general == null) { Debug.LogWarning("[PASS Setup] XR settings unavailable — tick ARCore manually: Project Settings > XR Plug-in Management > Android."); return; }
                var manager = general.AssignedSettings;
                if (manager == null)
                {
                    manager = ScriptableObject.CreateInstance<XRManagerSettings>();
                    AssetDatabase.AddObjectToAsset(manager, general);
                    general.AssignedSettings = manager;
                    general.InitManagerOnStart = true;
                }
                var loaderType = System.Type.GetType("UnityEngine.XR.ARCore.ARCoreLoader, Unity.XR.ARCore");
                if (loaderType == null) { Debug.LogWarning("[PASS Setup] ARCoreLoader type not found (ARCore package missing?)."); return; }
                bool already = false;
                foreach (var l in manager.activeLoaders) if (l != null && l.GetType() == loaderType) already = true;
                if (!already)
                {
                    var loader = ScriptableObject.CreateInstance(loaderType) as XRLoader;
                    AssetDatabase.AddObjectToAsset(loader, manager);
                    if (manager.TryAddLoader(loader)) Debug.Log("[PASS Setup] ARCore loader assigned for Android.");
                }
                else Debug.Log("[PASS Setup] ARCore loader already assigned.");
                EditorUtility.SetDirty(manager);
                EditorUtility.SetDirty(general);
                AssetDatabase.SaveAssets();
            }
            catch (System.Exception e) { Debug.LogWarning($"[PASS Setup] XR loader auto-config skipped: {e.Message}"); }
        }

        private static void EnsureURP()
        {
            try
            {
                var pipeline = ScriptableObject.CreateInstance<UniversalRenderPipelineAsset>();
                var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(pipeline, UrpAssetPath);
                AssetDatabase.AddObjectToAsset(rendererData, pipeline);
                // Assign renderer data list (field shape varies across URP versions — reflect).
                bool assigned = false;
                var t = pipeline.GetType();
                foreach (var f in t.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance))
                {
                    if (f.FieldType == typeof(ScriptableRendererData[]))
                    { f.SetValue(pipeline, new ScriptableRendererData[] { rendererData }); assigned = true; break; }
                    if (f.FieldType == typeof(System.Collections.Generic.List<ScriptableRendererData>))
                    { f.SetValue(pipeline, new System.Collections.Generic.List<ScriptableRendererData> { rendererData }); assigned = true; break; }
                    if (typeof(ScriptableRendererData).IsAssignableFrom(f.FieldType))
                    { f.SetValue(pipeline, rendererData); assigned = true; }
                }
                EditorUtility.SetDirty(pipeline);
                AssetDatabase.SaveAssets();
                if (assigned)
                {
                    GraphicsSettings.defaultRenderPipeline = pipeline;
                    Debug.Log("[PASS Setup] URP asset created + assigned.");
                }
                else Debug.LogWarning("[PASS Setup] URP renderer-data field not matched — assign manually: Create > Rendering > URP Asset.");
            }
            catch (System.Exception e) { Debug.LogWarning($"[PASS Setup] URP auto-config skipped: {e.Message}"); }
        }

        // ---------- particle helpers ----------

        private static ParticleSystem MakePS(string name, Vector3 pos, Color color, float size, float speed,
            float lifetime, float rate, float coneAngle, float coneRadius, bool worldCollision3D)
        {
            var go = new GameObject(name);
            go.transform.position = pos;
            var ps = go.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.duration = 5f; main.loop = true; main.playOnAwake = true;
            main.startLifetime = lifetime; main.startSpeed = speed; main.startSize = size;
            main.startColor = color; main.maxParticles = 300;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = ps.emission; em.rateOverTime = rate;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = coneAngle; shape.radius = coneRadius;
            var colOverLife = ps.colorOverLifetime; colOverLife.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(
                new[] { new GradientColorKey(color, 0f), new GradientColorKey(color, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
            colOverLife.color = grad;
            if (worldCollision3D)
            {
                var col = ps.collision;
                col.enabled = true;
                col.type = ParticleSystemCollisionType.World;
                col.mode = ParticleSystemCollisionMode.Collision3D;
                col.sendCollisionMessages = true;
                col.collidesWith = ~0;
                col.lifetimeLoss = 0.9f;
            }
            return ps;
        }

        // ---------- prefabs ----------

        private static GameObject BuildPlanePrefab()
        {
            var root = new GameObject("ARDefaultPlane");
            root.AddComponent<MeshFilter>();
            var mr = root.AddComponent<MeshRenderer>();
            mr.material = TransparentPlaneMat();
            root.AddComponent<ARPlaneMeshVisualizer>();
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, PlanePrefabPath);
            Object.DestroyImmediate(root);
            return prefab;
        }

        private static GameObject BuildFirePrefab()
        {
            var root = new GameObject("FireHazard");
            root.AddComponent<FireHazard>();
            var rootCol = root.AddComponent<BoxCollider>(); // receives OnParticleCollision (must be non-trigger)
            rootCol.center = new Vector3(0, 0.9f, 0); rootCol.size = new Vector3(1.2f, 1.8f, 1.2f);
            var audio = root.AddComponent<AudioSource>();
            audio.loop = true; audio.playOnAwake = false; audio.spatialBlend = 1f;

            var baseGO = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            baseGO.name = "FireBase"; baseGO.tag = "FireBase";
            baseGO.transform.SetParent(root.transform, false);
            baseGO.transform.localScale = new Vector3(0.9f, 0.06f, 0.9f);
            baseGO.transform.localPosition = new Vector3(0, 0.03f, 0);
            baseGO.GetComponent<Renderer>().material = Lit(new Color(0.15f, 0.1f, 0.1f));

            var upperGO = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            upperGO.name = "FireUpper"; upperGO.tag = "FireUpper";
            upperGO.transform.SetParent(root.transform, false);
            upperGO.transform.localScale = new Vector3(0.7f, 1.1f, 0.7f);
            upperGO.transform.localPosition = new Vector3(0, 1.0f, 0);
            var upperMat = Lit(new Color(1f, 0.45f, 0.05f, 0.35f));
            upperGO.GetComponent<Renderer>().material = upperMat;

            var flame = MakePS("Flames", new Vector3(0, 0.45f, 0), new Color(1f, 0.5f, 0.05f),
                0.5f, 1.6f, 0.8f, 40f, 14f, 0.28f, false);
            flame.transform.SetParent(root.transform, false);
            var smoke = MakePS("Smoke", new Vector3(0, 1.3f, 0), new Color(0.25f, 0.25f, 0.25f),
                0.8f, 1.0f, 2.0f, 12f, 10f, 0.2f, false);
            smoke.transform.SetParent(root.transform, false);
            var steam = MakePS("Steam", new Vector3(0, 0.3f, 0), new Color(0.9f, 0.9f, 0.9f, 0.8f),
                0.6f, 1.4f, 1.6f, 5f, 20f, 0.35f, false);
            steam.transform.SetParent(root.transform, false);

            var lightGO = new GameObject("FireLight");
            lightGO.transform.SetParent(root.transform, false);
            lightGO.transform.localPosition = new Vector3(0, 1.0f, 0);
            var pl = lightGO.AddComponent<Light>();
            pl.type = LightType.Point; pl.color = new Color(1f, 0.55f, 0.15f);
            pl.intensity = 3f; pl.range = 5f;

            var hz = root.GetComponent<FireHazard>();
            SetRef(hz, "flameParticles", flame);
            SetRef(hz, "smokeParticles", smoke);
            SetRef(hz, "steamParticles", steam);
            SetRef(hz, "fireLight", pl);
            SetRef(hz, "fireLoopSource", audio);
            // controller / sweepTracker intentionally left null -> runtime auto-find.

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, FirePrefabPath);
            Object.DestroyImmediate(root);
            return prefab;
        }

        private static GameObject BuildExtinguisherPrefab()
        {
            var root = new GameObject("Extinguisher");
            var ctrl = root.AddComponent<ExtinguisherController>();
            root.AddComponent<SweepAndCoverageTracker>();
            // controller.sweepTracker not a field — tracker finds controller itself.

            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "Body";
            body.transform.SetParent(root.transform, false);
            body.transform.localScale = new Vector3(0.16f, 0.26f, 0.16f);
            body.transform.localPosition = new Vector3(0, -0.06f, 0);
            body.GetComponent<Renderer>().material = Lit(new Color(0.8f, 0.05f, 0.05f), 0.3f, 0.6f);

            var leverPivot = new GameObject("LeverPivot");
            leverPivot.transform.SetParent(root.transform, false);
            leverPivot.transform.localPosition = new Vector3(0, 0.1f, 0);
            var lever = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lever.name = "Lever";
            lever.transform.SetParent(leverPivot.transform, false);
            lever.transform.localScale = new Vector3(0.16f, 0.015f, 0.03f);
            lever.transform.localPosition = new Vector3(0.07f, 0, 0);
            lever.GetComponent<Renderer>().material = Lit(Color.gray, 0.8f, 0.5f);

            var pin = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pin.name = "SafetyPin";
            pin.transform.SetParent(root.transform, false);
            pin.transform.localScale = new Vector3(0.02f, 0.05f, 0.02f);
            pin.transform.localPosition = new Vector3(0.06f, 0.1f, 0);
            pin.GetComponent<Renderer>().material = Lit(new Color(0.9f, 0.85f, 0.2f), 0.9f, 0.7f);
            var puller = pin.AddComponent<SafetyPinPuller>();
            var pinAudio = pin.AddComponent<AudioSource>();
            pinAudio.playOnAwake = false;
            SetRef(puller, "audioSource", pinAudio);
            // extractionAxis default +X (outward), threshold default 0.05 m.

            var nozzle = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            nozzle.name = "Nozzle";
            nozzle.transform.SetParent(root.transform, false);
            nozzle.transform.localScale = new Vector3(0.03f, 0.14f, 0.03f);
            nozzle.transform.localRotation = Quaternion.Euler(90f, 0f, 0f); // lie along +Z
            nozzle.transform.localPosition = new Vector3(0, 0.03f, 0.12f);
            nozzle.GetComponent<Renderer>().material = Lit(Color.black, 0.2f, 0.4f);

            var tip = new GameObject("NozzleTip");
            tip.transform.SetParent(root.transform, false);
            tip.transform.localPosition = new Vector3(0, 0.03f, 0.24f);
            tip.transform.localRotation = Quaternion.identity; // forward = +Z (camera forward for camera-child)

            var spray = MakePS("Spray", Vector3.zero, new Color(0.95f, 0.95f, 0.9f),
                0.14f, 8f, 1.1f, 140f, 7f, 0.04f, true);
            spray.transform.SetParent(tip.transform, false);
            spray.transform.localPosition = Vector3.zero;
            spray.transform.localRotation = Quaternion.Euler(90f, 0f, 0f); // cone +Y -> +Z
            spray.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            var sprayAudio = root.AddComponent<AudioSource>();
            sprayAudio.loop = true; sprayAudio.playOnAwake = false; sprayAudio.spatialBlend = 1f;

            var reticle = GameObject.CreatePrimitive(PrimitiveType.Quad);
            reticle.name = "Reticle";
            reticle.transform.SetParent(tip.transform, false);
            reticle.transform.localPosition = new Vector3(0, 0, 0.06f);
            reticle.transform.localScale = Vector3.one * 0.03f;
            Object.DestroyImmediate(reticle.GetComponent<Collider>());
            var retRenderer = reticle.GetComponent<Renderer>();
            retRenderer.material = Lit(Color.white);

            SetRef(ctrl, "leverPivot", leverPivot.transform);
            SetRef(ctrl, "nozzleTip", tip.transform);
            SetRef(ctrl, "sprayParticles", spray);
            SetRef(ctrl, "sprayLoopSource", sprayAudio);
            SetRef(ctrl, "reticleRenderer", retRenderer);

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, ExtPrefabPath);
            Object.DestroyImmediate(root);
            return prefab;
        }

        // ---------- scene ----------

        private static void BuildScene(GameObject planePrefab, GameObject firePrefab, GameObject extPrefab)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var session = new GameObject("AR Session");
            session.AddComponent<ARSession>();

            var origin = new GameObject("AR Session Origin");
            var arOrigin = origin.AddComponent<ARSessionOrigin>();
            var planeMgr = origin.AddComponent<ARPlaneManager>();
            planeMgr.requestedDetectionMode = PlaneDetectionMode.Horizontal;
            var raycastMgr = origin.AddComponent<ARRaycastManager>();
            SetRef(planeMgr, "m_PlanePrefab", planePrefab);

            var camGO = new GameObject("AR Camera");
            camGO.tag = "MainCamera";
            camGO.transform.SetParent(origin.transform, false);
            camGO.transform.localPosition = new Vector3(0, 1f, 0);
            var cam = camGO.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;
            cam.nearClipPlane = 0.1f; cam.farClipPlane = 30f;
            camGO.AddComponent<ARCameraManager>();
            camGO.AddComponent<ARCameraBackground>();
            arOrigin.camera = cam;

            var trainer = new GameObject("Trainer");
            trainer.AddComponent<ExtinguisherFSM>();
            var placement = trainer.AddComponent<ARPlacementManager>();
            SetRef(placement, "planeManager", planeMgr);
            SetRef(placement, "raycastManager", raycastMgr);
            SetRef(placement, "arCamera", cam);
            SetRef(placement, "fireHazardPrefab", firePrefab);
            SetRef(placement, "extinguisherViewPrefab", extPrefab);

            var sun = new GameObject("Directional Light");
            var dl = sun.AddComponent<Light>();
            dl.type = LightType.Directional; dl.intensity = 1f;
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            BuildUI(trainer.GetComponent<ExtinguisherFSM>(), placement);

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorSceneManager.OpenScene(ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void BuildUI(ExtinguisherFSM fsm, ARPlacementManager placement)
        {
            if (Object.FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));

            var canvasGO = new GameObject("TrainingUI");
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasGO.AddComponent<CanvasScaler>();
            canvasGO.AddComponent<GraphicRaycaster>();
            var ui = canvasGO.AddComponent<TrainingUI>();

            Text MakeText(string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 pos, int size, TextAnchor align)
            {
                var go = new GameObject(name);
                go.transform.SetParent(canvasGO.transform, false);
                var t = go.AddComponent<Text>();
                t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                t.fontSize = size; t.alignment = align; t.color = Color.white;
                var rt = t.rectTransform;
                rt.anchorMin = anchorMin; rt.anchorMax = anchorMax;
                rt.anchoredPosition = pos; rt.sizeDelta = new Vector2(600, 60);
                return t;
            }

            Slider MakeSlider(string name, Vector2 pos, Vector2 size)
            {
                var go = new GameObject(name);
                go.transform.SetParent(canvasGO.transform, false);
                var s = go.AddComponent<Slider>();
                s.minValue = 0f; s.maxValue = 1f; s.value = 1f;
                var rt = s.GetComponent<RectTransform>();
                rt.anchorMin = rt.anchorMax = new Vector2(0, 1);
                rt.anchoredPosition = pos; rt.sizeDelta = size;
                return s;
            }

            var warnPanel = new GameObject("ProximityWarning");
            warnPanel.transform.SetParent(canvasGO.transform, false);
            var warnRT = warnPanel.AddComponent<RectTransform>();
            warnRT.anchorMin = new Vector2(0.5f, 1f); warnRT.anchorMax = new Vector2(0.5f, 1f);
            warnRT.anchoredPosition = new Vector2(0, -60); warnRT.sizeDelta = new Vector2(700, 70);
            var warnImg = warnPanel.AddComponent<Image>();
            warnImg.color = new Color(0.7f, 0.1f, 0.1f, 0.85f);
            var warnText = MakeText("WarningText", new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -60), 22, TextAnchor.MiddleCenter);
            warnText.transform.SetParent(warnPanel.transform, false);
            warnText.rectTransform.anchoredPosition = Vector2.zero;
            warnPanel.SetActive(false);

            var hint = MakeText("AimHint", new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -130), 24, TextAnchor.MiddleCenter);
            var health = MakeSlider("Health", new Vector2(120, -180), new Vector2(200, 20));
            var pin = MakeSlider("PinProgress", new Vector2(120, -210), new Vector2(200, 20)); pin.value = 0f;
            var pressure = MakeSlider("Pressure", new Vector2(120, -240), new Vector2(200, 20));

            var squeezeGO = new GameObject("SqueezeButton");
            squeezeGO.transform.SetParent(canvasGO.transform, false);
            var sqRT = squeezeGO.AddComponent<RectTransform>();
            sqRT.anchorMin = sqRT.anchorMax = new Vector2(1, 0);
            sqRT.anchoredPosition = new Vector2(-140, 140); sqRT.sizeDelta = new Vector2(200, 200);
            var sqImg = squeezeGO.AddComponent<Image>();
            sqImg.color = new Color(0.9f, 0.3f, 0.1f, 0.9f);
            var sqBtn = squeezeGO.AddComponent<Button>();
            var sqLabel = new GameObject("Label");
            sqLabel.transform.SetParent(squeezeGO.transform, false);
            var sqText = sqLabel.AddComponent<Text>();
            sqText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            sqText.text = "SQUEEZE\n(HOLD)"; sqText.alignment = TextAnchor.MiddleCenter;
            sqText.fontSize = 26; sqText.color = Color.white;
            sqText.rectTransform.anchorMin = Vector2.zero; sqText.rectTransform.anchorMax = Vector2.one;
            sqText.rectTransform.offsetMin = Vector2.zero; sqText.rectTransform.offsetMax = Vector2.zero;
            var squeeze = squeezeGO.AddComponent<SqueezeButton>();
            squeezeGO.SetActive(false);

            GameObject MakePanel(string name, string body)
            {
                var p = new GameObject(name);
                p.transform.SetParent(canvasGO.transform, false);
                var rt2 = p.AddComponent<RectTransform>();
                rt2.anchorMin = rt2.anchorMax = new Vector2(0.5f, 0.5f);
                rt2.sizeDelta = new Vector2(560, 320);
                var img = p.AddComponent<Image>();
                img.color = new Color(0.08f, 0.12f, 0.08f, 0.92f);
                var t = new GameObject("Body");
                t.transform.SetParent(p.transform, false);
                var txt = t.AddComponent<Text>();
                txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                txt.text = body; txt.alignment = TextAnchor.MiddleCenter;
                txt.fontSize = 26; txt.color = Color.white;
                txt.rectTransform.anchorMin = Vector2.zero; txt.rectTransform.anchorMax = Vector2.one;
                txt.rectTransform.offsetMin = new Vector2(20, 20); txt.rectTransform.offsetMax = new Vector2(-20, -20);
                p.SetActive(false);
                return p;
            }
            var success = MakePanel("SuccessPanel", "Fire Extinguished!");
            var successText = success.transform.Find("Body").GetComponent<Text>();
            var fail = MakePanel("FailPanel", "Out of pressure!\nThe fire is still burning.\nReplay to try again.");

            SetRef(ui, "proximityWarning", warnPanel);
            SetRef(ui, "proximityText", warnText);
            SetRef(ui, "aimHintText", hint);
            SetRef(ui, "healthSlider", health);
            SetRef(ui, "pinSlider", pin);
            SetRef(ui, "pressureSlider", pressure);
            SetRef(ui, "squeezeButton", squeezeGO);
            SetRef(ui, "successPanel", success);
            SetRef(ui, "successMetricsText", successText);
            SetRef(ui, "failPanel", fail);
            SetRef(squeeze, "controller", null); // auto-found at runtime
            _ = sqBtn; _ = fsm; _ = placement;
        }
    }
}
