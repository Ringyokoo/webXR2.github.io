// script.js — рабочий FaceLandmarker + 3D-шляпа + безопасная трансформация
import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;

const demosSection = document.getElementById("demos");
const toggleLandmarksButton = document.getElementById("toggleLandmarksButton");
const videoBlendShapes = document.getElementById("video-blend-shapes");
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("webcamButton");
const hatButton = document.getElementById("hatButton");
const overlay = document.getElementById("ar-overlay-container");

let faceLandmarker;
let runningMode = "IMAGE";
let webcamRunning = false;
let showLandmarks = false;


const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.classList.add("three-canvas");
overlay.appendChild(renderer.domElement);

// Камера без точных параметров пока
let camera;
let hatGroup = new THREE.Group();

function animate() {
    requestAnimationFrame(animate);
    if (camera) {
        renderer.render(scene, camera);
    }
}
animate(); // можно вызывать сразу

async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode,
        numFaces: 1
    });
    demosSection.classList.remove("invisible");
}
createFaceLandmarker();

if (navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
}
toggleLandmarksButton.addEventListener("click", () => {
    showLandmarks = !showLandmarks;
});

if (navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
}
hatButton.addEventListener("click", () => {
    hatGroup.visible = !hatGroup.visible;
});

function enableCam() {
    if (!faceLandmarker) return;
    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ? "DISABLE9" : "ENABLE WEBCAM9";

    const constraints = {
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user"
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        const track = stream.getVideoTracks()[0];
        // const settings = track.getSettings();
        // console.log('📷 Реальные параметры камеры:', settings);
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
    });
}

let lastVideoTime = -1;
let results = undefined;
const drawingUtils = new DrawingUtils(canvasCtx);

async function predictWebcam() {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // const aspect = videoWidth / videoHeight;

    const bounds = video.getBoundingClientRect();
    const domWidth = bounds.width;
    const domHeight = bounds.height;
    const aspect = domWidth / domHeight;
    // console.log(domWidth, domHeight, aspect, videoWidth, videoHeight);
    // renderer.setSize(videoWidth, videoHeight, false);
    // Камера создаётся теперь — когда есть точный aspect
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 0, 5); // или 0.5, в зависимости от сцены


    const container = document.getElementById("cameraContainer");
    container.style.aspectRatio = `${videoWidth} / ${videoHeight}`;

    video.style.width = videoWidth + "px";
    video.style.height = videoHeight + "px";
    canvasElement.style.width = videoWidth + "px";
    canvasElement.style.height = videoHeight + "px";
    canvasElement.width = videoWidth;
    canvasElement.height = videoHeight;
    renderer.setSize(videoWidth, videoHeight);

    if (hatGroup && !hatGroup.userData.initialized) {
        const loader = new GLTFLoader();
        loader.load('hat_glb_bej.glb', (gltf) => {
            const hat = gltf.scene;

            hat.rotateX(0.1);; // Сдвиг назад (чтобы центр шляпы был позади)
            const heightFactor = videoWidth / videoHeight;
            hat.scale.setScalar(2.7); // Временно 1, будем менять позже
            hat.position.set(0, 8, -7.5);
            hatGroup.add(hat);
            scene.add(hatGroup);
        });

        hatGroup.userData.initialized = true; // чтобы не менять каждый кадр
    }

    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await faceLandmarker.setOptions({ runningMode });
        return requestAnimationFrame(predictWebcam);
    }

    const startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = faceLandmarker.detectForVideo(video, startTimeMs);
    }

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results?.faceLandmarks?.length) {
        //  document.getElementById("loadingOverlay").remove();
        if (showLandmarks) {
            for (const landmarks of results.faceLandmarks) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "#E0E0E0" });
            }
        }

        const matrix = results.facialTransformationMatrixes?.[0]?.data;
        if (matrix && matrix.every(Number.isFinite)) {
            // const poseTransform = new THREE.Matrix4().fromArray(matrix);

            // // 1. Отключаем автообновление матрицы
            // hatGroup.matrixAutoUpdate = false;


            // // 2. Копируем матрицу напрямую
            // hatGroup.matrix.copy(poseTransform);
            // console.log(results.faceLandmarks[10])

            // внутри predictWebcam, после получения matrix =================================
            const raw = new THREE.Matrix4().fromArray(matrix);   // poseTransform в КООРДИНАТАХ КАМЕРЫ

            // ── 1. делаем масштаб однородным (иначе «вытягивается вверх») ────────────────
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            raw.decompose(pos, quat, scale);

            const s = (scale.x + scale.y + scale.z) / 3;          // средний масштаб
            const uniform = new THREE.Vector3(s, s, s);
            raw.compose(pos, quat, uniform);                      // собираем обратно без перекоса

            // ── 2. переносим из «камеры» в «мир»  ─────────────────────────────────────────
            //  camera.matrixWorld  • raw   → объект теперь «прикручен» к голове,
            //  но существует в общей сцене (полноценный AR)
            const world = new THREE.Matrix4().multiplyMatrices(
                camera.matrixWorld,   // из камеры в мир
                raw                   // поза головы в камере
            );

            // ── 3. применяем  ─────────────────────────────────────────────────────────────
            hatGroup.matrixAutoUpdate = false;
            hatGroup.matrix.copy(world);

        }

    }

    if (webcamRunning) window.requestAnimationFrame(predictWebcam);
}

// освещение
// Создаём новое освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);  // Более яркий общий свет
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);  // Ещё ярче
directionalLight.position.set(5, 8, 6);  // Выше и спереди для равномерного освещения
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);  // Усиленный заполняющий свет
fillLight.position.set(-3, 2, -4);  // Слева и сзади
scene.add(fillLight);


const originalLog = console.log;
console.log = function (...args) {
    if (args[0]?.includes?.("Graph successfully started running")) {
        document.getElementById("loadingOverlay").style.display = "none";
    }
    originalLog.apply(console, args);
};

