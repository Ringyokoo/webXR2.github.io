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
const overlay = document.getElementById("ar-overlay-container");

let faceLandmarker;
let runningMode = "IMAGE";
let webcamRunning = false;
let showLandmarks = false;
// const videoWidth = 480;
const camScale = document.getElementById("scaleCamera");


//console.log(aspect);

// Three.js
// const renderer = new THREE.WebGLRenderer({ alpha: true });
// renderer.setPixelRatio(window.devicePixelRatio);
// renderer.setSize(video.videoWidth, video.videoHeight);
// console.log(video.videoWidth, video.videoHeight, 'sjjfhsjhgjgjhdgfdsghsjhgjgfhsdghj');
// renderer.domElement.classList.add("three-canvas");
// overlay.appendChild(renderer.domElement);

// const scene = new THREE.Scene();
// const camera = new THREE.PerspectiveCamera(63.5, video.videoWidth / video.videoHeight, 0.1, 1000);
// camera.position.set(0, 0, 0);

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.classList.add("three-canvas");
overlay.appendChild(renderer.domElement);

// Камера без точных параметров пока
let camera;



// const geometry = new THREE.ConeGeometry(10, 10, 10);
// geometry.rotateX(0.1);
// geometry.translate(0, 15, -2);  // основание в (0,0,0), вершина вверх
// const material = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
// const hat = new THREE.Mesh(geometry, material);
// let hatGroup = new THREE.Group();
//hatGroup.add(hat);

// hat.matrixAutoUpdate = true;





let hatGroup = new THREE.Group();
// let hat;
// hatGroup.add(hat);

const loader = new GLTFLoader();
loader.load('hat_glb_bej.glb', (gltf) => {
    const hat = gltf.scene;
    hat.scale.set(2.5, 2.5, 2.5); // Временно 1, будем менять позже
    hat.rotateX(0.1);; // Сдвиг назад (чтобы центр шляпы был позади)
    hat.position.set(0, 9, -8);
    hatGroup.add(hat);
    //   hatGroup.visible = false;
      scene.add(hatGroup);
});

// scene.add(hatGroup);

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

function enableCam() {
    if (!faceLandmarker) return;
    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ? "DISABLE" : "ENABLE WEBCAM";

    const constraints = {
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user"
        }
    };
    // console.log(constraints.video.width);
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
    camScale.innerHTML = `${videoWidth} / ${videoHeight}`;
    const aspect = video.videoHeight / video.videoWidth;
    // console.log(video.videoWidth, videoHeight, aspect);
    // Размеры рендерера
    renderer.setSize(videoWidth, videoHeight, false);

    // Камера создаётся теперь — когда есть точный aspect
    camera = new THREE.PerspectiveCamera(50, videoWidth / videoHeight, 0.1, 1000);
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
    // video.style.objectFit = "cover";



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
            const poseTransform = new THREE.Matrix4().fromArray(matrix);

            // 1. Отключаем автообновление матрицы
            hatGroup.matrixAutoUpdate = false;


            // 2. Копируем матрицу напрямую
            hatGroup.matrix.copy(poseTransform);
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

// Обновляем рендеринг
// renderer.render(scene, camera);

function drawBlendShapes(el, blendShapes) {
    if (!blendShapes.length) return;
    // можно реализовать позже при необходимости
}

const originalLog = console.log;
console.log = function (...args) {
  if (args[0]?.includes?.("Graph successfully started running")) {
    document.getElementById("loadingOverlay").style.display = "none";
  }
  originalLog.apply(console, args);
};

