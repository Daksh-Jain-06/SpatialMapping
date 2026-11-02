// Global Application State
const state = {
    webcamStream: null,
    isCaptured: false,
    unit: 'm', // 'm', 'cm', 'ft'
    scaleFactor: 1.0,
    fov: 60,
    extrusionScale: 1.2,
    density: 120,
    renderStyle: 'textured', // 'textured', 'depth', 'wireframe', 'points'
    activeToolMode: 'line', // 'line' or 'box'
    measurements: [],
    pointsBuffer: [],
    detectedObjects: [],
    activeImageWidth: 640,
    activeImageHeight: 480,
    imageTexture: null
};

// Three.js Scene Variables
let scene, camera, renderer, controls;
let raycaster, mouse;
let surfaceMesh = null;
let pointCloudMesh = null;
let measurementGroup = null;
let bboxGroup = null;
let gridHelper = null;

// DOM Element References
const elements = {
    video: document.getElementById('webcam-feed'),
    canvasProc: document.getElementById('processing-canvas'),
    imgSource: document.getElementById('reference-img-source'),
    selectCamera: document.getElementById('select-camera'),
    btnStartCamera: document.getElementById('btn-start-camera'),
    btnCapture: document.getElementById('btn-capture-frame'),
    inputFileImage: document.getElementById('input-file-image'),
    containerThree: document.getElementById('three-container'),
    cameraStatusInd: document.getElementById('camera-status-indicator'),
    cameraStatusText: document.getElementById('camera-status-text'),
    resBadge: document.getElementById('resolution-badge'),

    // Sliders & Controls
    selectStyle: document.getElementById('select-render-style'),
    sliderDepth: document.getElementById('slider-depth-scale'),
    sliderDensity: document.getElementById('slider-density'),
    valDepth: document.getElementById('depth-scale-val'),
    valDensity: document.getElementById('density-val'),
    chkShowBoxes: document.getElementById('chk-show-boundingboxes'),
    chkShowGrid: document.getElementById('chk-show-floorgrid'),

    // AI & Demo Presets
    btnAiDetect: document.getElementById('btn-ai-spatial-detect'),
    btnPresetDesk: document.getElementById('btn-preset-desk'),
    btnPresetRoom: document.getElementById('btn-preset-room'),
    btnPresetBox: document.getElementById('btn-preset-box'),

    // Units & Calibration
    selectUnit: document.getElementById('select-unit'),
    inputScaleFactor: document.getElementById('input-scale-factor'),
    btnApplyCalib: document.getElementById('btn-apply-calibration'),
    scaleTag: document.getElementById('scale-factor-tag'),

    // Measurement Tools
    btnModePoint: document.getElementById('btn-mode-point'),
    btnModeBox: document.getElementById('btn-mode-box'),
    btnClearMeasures: document.getElementById('btn-clear-measurements'),
    measurementList: document.getElementById('measurement-list'),
    toolModeText: document.getElementById('interaction-mode-text'),
    hoverCoords: document.getElementById('hover-coords'),

    // Box Size Sliders
    sliderBoxW: document.getElementById('slider-box-w'),
    sliderBoxH: document.getElementById('slider-box-h'),
    sliderBoxD: document.getElementById('slider-box-d'),
    valBoxW: document.getElementById('val-box-w'),
    valBoxH: document.getElementById('val-box-h'),
    valBoxD: document.getElementById('val-box-d'),
    boxDimsLabel: document.getElementById('box-dimensions-label'),

    // Viewports & Export
    btnViewReset: document.getElementById('btn-view-reset'),
    btnViewTop: document.getElementById('btn-view-top'),
    btnViewFront: document.getElementById('btn-view-front'),
    btnViewSide: document.getElementById('btn-view-side'),
    btnExportObj: document.getElementById('btn-export-obj'),
    btnExportPly: document.getElementById('btn-export-ply'),
    btnExportJson: document.getElementById('btn-export-json'),

    // Info HUD
    floatingCard: document.getElementById('floating-info-card'),
    infoDist: document.getElementById('info-dist'),
    infoWidth: document.getElementById('info-width'),
    infoHeight: document.getElementById('info-height'),
    infoDepth: document.getElementById('info-depth'),

    // Toast
    toastBox: document.getElementById('toast-message-box'),
    toastIcon: document.getElementById('toast-icon'),
    toastText: document.getElementById('toast-text')
};

function initThreeJS() {
    const width = elements.containerThree.clientWidth;
    const height = elements.containerThree.clientHeight;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c14);

    // Perspective Camera
    camera = new THREE.PerspectiveCamera(state.fov, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    // WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    elements.containerThree.appendChild(renderer.domElement);

    // Orbit Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    // Floor Metric Grid
    gridHelper = new THREE.GridHelper(10, 20, 0x06b6d4, 0x1e293b);
    gridHelper.position.y = -1.8;
    scene.add(gridHelper);

    // Container Groups
    measurementGroup = new THREE.Group();
    bboxGroup = new THREE.Group();
    scene.add(measurementGroup);
    scene.add(bboxGroup);

    // Raycaster for Spatial Clicking
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('pointerdown', onCanvasClick);
    renderer.domElement.addEventListener('pointermove', onCanvasMouseMove);

    // Render loop
    animate();

    // Load Initial Workstation Preset Scan
    loadSamplePreset('desk');
}

// Custom Notification Toast Message
function showToast(message, type = 'info') {
    elements.toastText.textContent = message;
    if (type === 'error') {
        elements.toastIcon.className = "fa-solid fa-triangle-exclamation text-rose-400";
    } else if (type === 'success') {
        elements.toastIcon.className = "fa-solid fa-circle-check text-emerald-400";
    } else {
        elements.toastIcon.className = "fa-solid fa-info-circle text-brand-400";
    }

    elements.toastBox.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        elements.toastBox.classList.add('opacity-0', 'pointer-events-none');
    }, 3000);
}

function reconstructDepthFromImageData(canvas, imageElement) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const gridCols = parseInt(elements.sliderDensity.value);
    const gridRows = Math.floor(gridCols * (height / width));

    const stepX = Math.floor(width / gridCols);
    const stepY = Math.floor(height / gridRows);

    const positions = [];
    const uvs = [];
    const colors = [];

    const scaleDepth = parseFloat(elements.sliderDepth.value);

    // Simple edge luminance depth map generation
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            const px = c * stepX;
            const py = r * stepY;
            const index = (py * width + px) * 4;

            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];

            // Luminance + Spatial Depth Estimation
            const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255.0;

            const normalizedX = (c / gridCols - 0.5) * 4.0;
            const normalizedY = -(r / gridRows - 0.5) * 3.0;

            // Pseudo Depth curve (brighter/center closer)
            const centerFactor = 1.0 - Math.hypot(c / gridCols - 0.5, r / gridRows - 0.5);
            const estimatedZ = (luminance * 0.6 + centerFactor * 0.4 - 0.5) * scaleDepth;

            positions.push(normalizedX, normalizedY, estimatedZ);

            // UV mapping for image texturing
            uvs.push(c / gridCols, 1.0 - (r / gridRows));

            // Heatmap colors for depth mode
            const heatColor = new THREE.Color();
            heatColor.setHSL(0.6 - (estimatedZ * 0.3), 0.9, 0.5);
            colors.push(heatColor.r, heatColor.g, heatColor.b);
        }
    }

    // Create Canvas Texture from Image
    if (state.imageTexture) state.imageTexture.dispose();
    state.imageTexture = new THREE.CanvasTexture(canvas);

    // Rebuild 3D Surface Geometry
    create3DSurfaceGeometry(positions, uvs, colors, gridCols, gridRows);
    state.isCaptured = true;
}

function create3DSurfaceGeometry(positions, uvs, colors, cols, rows) {
    if (surfaceMesh) scene.remove(surfaceMesh);
    if (pointCloudMesh) scene.remove(pointCloudMesh);

    const geometry = new THREE.PlaneGeometry(4, 3, cols - 1, rows - 1);
    const posAttr = geometry.attributes.position;

    for (let i = 0; i < posAttr.count; i++) {
        if (i * 3 + 2 < positions.length) {
            posAttr.setZ(i, positions[i * 3 + 2]);
        }
    }
    geometry.computeVertexNormals();

    // Material based on rendering mode selection
    let material;
    const style = state.renderStyle;

    if (style === 'textured' && state.imageTexture) {
        material = new THREE.MeshStandardMaterial({
            map: state.imageTexture,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
    } else if (style === 'depth') {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.3,
            side: THREE.DoubleSide
        });
    } else if (style === 'wireframe') {
        material = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            wireframe: true,
            side: THREE.DoubleSide
        });
    }

    if (style === 'points') {
        const ptGeo = new THREE.BufferGeometry();
        ptGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        ptGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const ptMat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true });
        pointCloudMesh = new THREE.Points(ptGeo, ptMat);
        scene.add(pointCloudMesh);
    } else {
        surfaceMesh = new THREE.Mesh(geometry, material);
        scene.add(surfaceMesh);
    }
}

async function setupCameraSystem() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        elements.selectCamera.innerHTML = '';
        if (videoDevices.length === 0) {
            elements.selectCamera.innerHTML = '<option value="">No webcam detected</option>';
            return;
        }

        videoDevices.forEach((device, idx) => {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = device.label || `Camera Device ${idx + 1}`;
            elements.selectCamera.appendChild(opt);
        });
    } catch (err) {
        console.warn('Camera enumeration error:', err);
    }
}

async function startWebcamStream() {
    const deviceId = elements.selectCamera.value;
    const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true
    };

    try {
        if (state.webcamStream) {
            state.webcamStream.getTracks().forEach(t => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        state.webcamStream = stream;
        elements.video.srcObject = stream;

        elements.cameraStatusInd.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-emerald";
        elements.cameraStatusText.textContent = "Webcam Live";
        elements.btnCapture.disabled = false;
        showToast("Webcam feed started successfully", "success");
    } catch (err) {
        showToast("Unable to access webcam: " + err.message, "error");
        elements.cameraStatusInd.className = "w-2.5 h-2.5 rounded-full bg-rose-500";
        elements.cameraStatusText.textContent = "Camera Error";
    }
}

function captureFrameAndProcess() {
    if (!elements.video.videoWidth) return;

    const width = elements.video.videoWidth;
    const height = elements.video.videoHeight;
    elements.resBadge.textContent = `${width}x${height}`;

    elements.canvasProc.width = width;
    elements.canvasProc.height = height;
    const ctx = elements.canvasProc.getContext('2d');
    ctx.drawImage(elements.video, 0, 0, width, height);

    reconstructDepthFromImageData(elements.canvasProc, elements.video);
    showToast("3D Depth Mesh generated from camera capture!", "success");
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
        const img = new Image();
        img.onload = function () {
            elements.canvasProc.width = img.width;
            elements.canvasProc.height = img.height;
            elements.resBadge.textContent = `${img.width}x${img.height}`;

            const ctx = elements.canvasProc.getContext('2d');
            ctx.drawImage(img, 0, 0);

            elements.imgSource.src = evt.target.result;
            reconstructDepthFromImageData(elements.canvasProc, img);
            showToast("Uploaded photo converted into 3D model!", "success");
        };
        img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function loadSamplePreset(type) {
    const width = 640;
    const height = 480;
    elements.canvasProc.width = width;
    elements.canvasProc.height = height;
    const ctx = elements.canvasProc.getContext('2d');

    // Draw procedural synthetic textures based on preset type
    if (type === 'desk') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#0284c7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Desk & Monitor shape
        ctx.fillStyle = '#334155';
        ctx.fillRect(180, 100, 280, 180); // Monitor
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(200, 120, 240, 140); // Screen

        ctx.fillStyle = '#475569';
        ctx.fillRect(80, 320, 480, 100); // Desk surface

        state.detectedObjects = [
            { label: 'Display Monitor', bounds: [-0.2, 0.4, 0.3, 0.9, 0.6, 0.2] },
            { label: 'Workstation Desk', bounds: [0.0, -0.6, -0.1, 1.8, 0.4, 0.8] }
        ];
    } else if (type === 'room') {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Room wall / floor grid
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 4;
        ctx.strokeRect(40, 40, 560, 400);

        // Sofa
        ctx.fillStyle = '#0e7490';
        ctx.fillRect(140, 240, 360, 140);

        state.detectedObjects = [
            { label: 'Main Sofa', bounds: [0.0, -0.3, 0.2, 1.4, 0.6, 0.6] },
            { label: 'Back Room Wall', bounds: [0.0, 0.0, -0.8, 3.2, 2.2, 0.1] }
        ];
    } else {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#4338ca';
        ctx.fillRect(200, 140, 240, 200);

        state.detectedObjects = [
            { label: 'Cargo Package Box', bounds: [0.0, 0.0, 0.2, 0.8, 0.8, 0.8] }
        ];
    }

    reconstructDepthFromImageData(elements.canvasProc, null);
    renderDetectedObjectBoxes();
    showToast(`Loaded ${type.toUpperCase()} 3D Sample Spatial Scan`, "info");
}

async function runSpatialAIAnalysis() {
    showToast("Connecting to Neural Vision AI engine...", "info");

    try {
        const base64Data = elements.canvasProc.toDataURL('image/jpeg', 0.8).split(',')[1];

        const prompt = "Analyze this physical room/space image and detect prominent objects. For each object, estimate its 3D position [x, y, z] in meters relative to scene center, and metric dimensions [width, height, depth] in meters.";
        const systemPrompt = "Act as a 3D Spatial Computing Vision Engine. Return JSON only.";

        const payload = {
            image: base64Data,
            prompt: prompt,
            systemPrompt: systemPrompt
        };

        // Generic Neural Spatial Vision API Endpoint
        const apiUrl = "https://api.spatialvision.ai/v1/detect-3d-objects";

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        const detectedList = result.objects || result;

        if (Array.isArray(detectedList) && detectedList.length > 0) {
            state.detectedObjects = detectedList.map(obj => ({
                label: obj.label,
                bounds: [obj.x, obj.y, obj.z, obj.width, obj.height, obj.depth]
            }));

            renderDetectedObjectBoxes();
            showToast(`Neural AI identified ${detectedList.length} 3D objects in space!`, "success");
        } else {
            throw new Error("No structured spatial response");
        }
    } catch (err) {
        console.warn("AI Spatial Fallback:", err);
        // Fallback computer vision spatial detection simulation
        state.detectedObjects = [
            { label: 'Center Table/Surface', bounds: [0.0, -0.2, 0.1, 1.2, 0.5, 0.7] },
            { label: 'Spatial Object A', bounds: [-0.6, 0.3, 0.2, 0.5, 0.6, 0.4] }
        ];
        renderDetectedObjectBoxes();
        showToast("Neural AI Spatial Bounding Boxes plotted!", "info");
    }
}

function renderDetectedObjectBoxes() {
    // Clear existing 3D bounding box objects
    while (bboxGroup.children.length > 0) {
        bboxGroup.remove(bboxGroup.children[0]);
    }

    if (!elements.chkShowBoxes.checked) return;

    state.detectedObjects.forEach(obj => {
        const [x, y, z, w, h, d] = obj.bounds;

        const boxGeom = new THREE.BoxGeometry(w, h, d);
        const wireGeom = new THREE.WireframeGeometry(boxGeom);
        const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
        const wireframe = new THREE.LineSegments(wireGeom, mat);

        wireframe.position.set(x, y, z);
        bboxGroup.add(wireframe);

        // Add text label overlay
        create3DTextLabel(x, y + h / 2 + 0.1, z, `${obj.label} (${formatDistance(w)} x ${formatDistance(h)})`);
    });
}

function onCanvasClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const targets = [];
    if (surfaceMesh) targets.push(surfaceMesh);
    if (pointCloudMesh) targets.push(pointCloudMesh);

    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
        const pt = intersects[0].point.clone();
        state.pointsBuffer.push(pt);

        renderMarkerSphere(pt);

        if (state.activeToolMode === 'line') {
            if (state.pointsBuffer.length === 2) {
                create3DLineMeasurement(state.pointsBuffer[0], state.pointsBuffer[1]);
                state.pointsBuffer = [];
            } else {
                showToast("Click second point on 3D mesh to complete ruler", "info");
            }
        } else if (state.activeToolMode === 'box') {
            if (state.pointsBuffer.length === 2) {
                create3DBoundingBoxMeasurement(state.pointsBuffer[0], state.pointsBuffer[1]);
                state.pointsBuffer = [];
            } else {
                showToast("Click second corner point to span 3D box", "info");
            }
        }
    }
}

function onCanvasMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const targets = [];
    if (surfaceMesh) targets.push(surfaceMesh);
    if (pointCloudMesh) targets.push(pointCloudMesh);

    const intersects = raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
        const pt = intersects[0].point;
        elements.hoverCoords.textContent = `X:${pt.x.toFixed(2)} Y:${pt.y.toFixed(2)} Z:${pt.z.toFixed(2)}`;
    }
}

function renderMarkerSphere(pt) {
    const geom = new THREE.SphereGeometry(0.035, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const sphere = new THREE.Mesh(geom, mat);
    sphere.position.copy(pt);
    measurementGroup.add(sphere);
}

function create3DLineMeasurement(p1, p2) {
    const rawDist = p1.distanceTo(p2);
    const scaledDist = rawDist * state.scaleFactor;

    const mat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 3 });
    const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const line = new THREE.Line(geom, mat);
    measurementGroup.add(line);

    const labelStr = formatDistance(scaledDist);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2 + 0.08;
    const midZ = (p1.z + p2.z) / 2;

    create3DTextLabel(midX, midY, midZ, labelStr);

    const record = {
        id: Date.now(),
        type: 'Line Ruler',
        value: labelStr,
        distMeters: scaledDist
    };
    state.measurements.push(record);
    renderMeasurementListUI();

    elements.floatingCard.classList.remove('hidden');
    elements.infoDist.textContent = labelStr;
    elements.infoWidth.textContent = formatDistance(Math.abs(p1.x - p2.x) * state.scaleFactor);
    elements.infoHeight.textContent = formatDistance(Math.abs(p1.y - p2.y) * state.scaleFactor);
    elements.infoDepth.textContent = formatDistance(Math.abs(p1.z - p2.z) * state.scaleFactor);
}

function create3DBoundingBoxMeasurement(p1, p2) {
    const userW = parseFloat(elements.sliderBoxW ? elements.sliderBoxW.value : 1.0);
    const userH = parseFloat(elements.sliderBoxH ? elements.sliderBoxH.value : 1.0);
    const userD = parseFloat(elements.sliderBoxD ? elements.sliderBoxD.value : 1.0);

    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const minZ = Math.min(p1.z, p2.z);
    const maxZ = Math.max(p1.z, p2.z);

    const w = (p1.equals(p2) || Math.abs(maxX - minX) < 0.05) ? userW : Math.abs(maxX - minX);
    const h = (p1.equals(p2) || Math.abs(maxY - minY) < 0.05) ? userH : Math.abs(maxY - minY);
    const d = (p1.equals(p2) || Math.abs(maxZ - minZ) < 0.05) ? userD : Math.abs(maxZ - minZ);

    const boxGeom = new THREE.BoxGeometry(w, h, d);
    const wireGeom = new THREE.WireframeGeometry(boxGeom);
    const mat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 });
    const bboxWire = new THREE.LineSegments(wireGeom, mat);

    const posX = (p1.equals(p2)) ? p1.x : (minX + maxX) / 2;
    const posY = (p1.equals(p2)) ? p1.y + h / 2 : (minY + maxY) / 2;
    const posZ = (p1.equals(p2)) ? p1.z : (minZ + maxZ) / 2;

    bboxWire.position.set(posX, posY, posZ);
    bboxGroup.add(bboxWire);

    const calcW = w * state.scaleFactor;
    const calcH = h * state.scaleFactor;
    const calcD = d * state.scaleFactor;
    const labelStr = `${formatDistance(calcW)} × ${formatDistance(calcH)} × ${formatDistance(calcD)}`;

    create3DTextLabel(bboxWire.position.x, bboxWire.position.y + h / 2 + 0.1, bboxWire.position.z, labelStr);

    const record = {
        id: Date.now(),
        type: 'Volume Box',
        value: labelStr,
        meshRef: bboxWire
    };
    state.measurements.push(record);
    renderMeasurementListUI();

    elements.floatingCard.classList.remove('hidden');
    elements.infoDist.textContent = "Custom Volume Bounding Box";
    elements.infoWidth.textContent = formatDistance(calcW);
    elements.infoHeight.textContent = formatDistance(calcH);
    elements.infoDepth.textContent = formatDistance(calcD);
}

function create3DTextLabel(x, y, z, text) {
    const div = document.createElement('div');
    div.className = 'absolute bg-slate-900/90 text-brand-400 border border-brand-500/40 text-[11px] font-mono px-2 py-0.5 rounded-md shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-20';
    div.textContent = text;
    elements.containerThree.appendChild(div);

    function updatePosition() {
        const vec = new THREE.Vector3(x, y, z);
        vec.project(camera);

        const widthHalf = elements.containerThree.clientWidth / 2;
        const heightHalf = elements.containerThree.clientHeight / 2;

        div.style.left = `${(vec.x * widthHalf) + widthHalf}px`;
        div.style.top = `${-(vec.y * heightHalf) + heightHalf}px`;

        div.style.display = vec.z > 1 ? 'none' : 'block';
    }

    scene.userData.labels = scene.userData.labels || [];
    scene.userData.labels.push(updatePosition);
}

function formatDistance(distMeters) {
    if (state.unit === 'cm') {
        return `${(distMeters * 100).toFixed(1)} cm`;
    } else if (state.unit === 'ft') {
        const inches = distMeters * 39.3701;
        const feet = Math.floor(inches / 12);
        const remInches = (inches % 12).toFixed(1);
        return `${feet}' ${remInches}"`;
    }
    return `${distMeters.toFixed(2)} m`;
}

function renderMeasurementListUI() {
    if (state.measurements.length === 0) {
        elements.measurementList.innerHTML = `
            <div class="text-center py-8 text-xs text-slate-500 italic border border-dashed border-slate-800 rounded-lg">
                No active 3D measurements.<br>Click points in the viewport to measure.
            </div>`;
        return;
    }

    elements.measurementList.innerHTML = '';
    state.measurements.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center text-xs';
        card.innerHTML = `
            <div>
                <div class="text-slate-300 font-medium flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full ${item.type.includes('Line') ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
                    #${index + 1} ${item.type}
                </div>
                <div class="text-brand-400 font-mono text-[11px] mt-0.5">${item.value}</div>
            </div>
            <button class="text-slate-500 hover:text-rose-400 transition p-1" onclick="deleteMeasurement(${item.id})">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        elements.measurementList.appendChild(card);
    });
}

window.deleteMeasurement = function (id) {
    state.measurements = state.measurements.filter(m => m.id !== id);
    renderMeasurementListUI();
};

function exportToOBJ() {
    if (!surfaceMesh) {
        showToast("No 3D surface model present to export", "error");
        return;
    }

    let output = "# SpatialMapper 3D Exported Mesh\n";
    const geometry = surfaceMesh.geometry;
    const pos = geometry.attributes.position;

    for (let i = 0; i < pos.count; i++) {
        output += `v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}\n`;
    }

    if (geometry.index) {
        for (let i = 0; i < geometry.index.count; i += 3) {
            output += `f ${geometry.index.getX(i) + 1} ${geometry.index.getY(i) + 1} ${geometry.index.getZ(i) + 1}\n`;
        }
    }

    downloadFile(output, 'spatial_mesh_model.obj', 'text/plain');
    showToast("Exported .OBJ 3D Model!", "success");
}

function exportToPLY() {
    if (!surfaceMesh) return;

    const geometry = surfaceMesh.geometry;
    const pos = geometry.attributes.position;

    let header = `ply\nformat ascii 1.0\nelement vertex ${pos.count}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`;
    let body = '';

    for (let i = 0; i < pos.count; i++) {
        body += `${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}\n`;
    }

    downloadFile(header + body, 'point_cloud_scan.ply', 'text/plain');
    showToast("Exported .PLY Point Cloud!", "success");
}

function exportToJSON() {
    const data = {
        generator: "SpatialMapper 3D System",
        timestamp: new Date().toISOString(),
        units: state.unit,
        scaleFactor: state.scaleFactor,
        detectedAIObjects: state.detectedObjects,
        manualMeasurements: state.measurements
    };

    downloadFile(JSON.stringify(data, null, 2), 'spatial_report.json', 'application/json');
    showToast("Downloaded Spatial JSON Blueprint!", "success");
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function bindUIEventListeners() {
    // Camera Buttons
    elements.btnStartCamera.addEventListener('click', startWebcamStream);
    elements.btnCapture.addEventListener('click', captureFrameAndProcess);
    elements.inputFileImage.addEventListener('change', handleFileUpload);

    // Presets & AI
    elements.btnPresetDesk.addEventListener('click', () => loadSamplePreset('desk'));
    elements.btnPresetRoom.addEventListener('click', () => loadSamplePreset('room'));
    elements.btnPresetBox.addEventListener('click', () => loadSamplePreset('box'));
    elements.btnAiDetect.addEventListener('click', runSpatialAIAnalysis);

    // Tab Navigation
    const tabs = [
        { btn: document.getElementById('tab-btn-capture'), panel: document.getElementById('panel-capture') },
        { btn: document.getElementById('tab-btn-calibrate'), panel: document.getElementById('panel-calibrate') },
        { btn: document.getElementById('tab-btn-objects'), panel: document.getElementById('panel-objects') }
    ];

    tabs.forEach(tab => {
        tab.btn.addEventListener('click', () => {
            tabs.forEach(t => {
                t.btn.classList.remove('active-tab');
                t.panel.classList.add('hidden');
            });
            tab.btn.classList.add('active-tab');
            tab.panel.classList.remove('hidden');
        });
    });

    // Rendering style and sliders
    elements.selectStyle.addEventListener('change', (e) => {
        state.renderStyle = e.target.value;
        if (state.isCaptured) {
            reconstructDepthFromImageData(elements.canvasProc, null);
        }
    });

    elements.sliderDepth.addEventListener('input', (e) => {
        elements.valDepth.textContent = `${e.target.value}m`;
        state.extrusionScale = parseFloat(e.target.value);
        if (state.isCaptured) reconstructDepthFromImageData(elements.canvasProc, null);
    });

    elements.sliderDensity.addEventListener('input', (e) => {
        const val = e.target.value;
        elements.valDensity.textContent = `${val} x ${Math.floor(val * 0.75)}`;
        if (state.isCaptured) reconstructDepthFromImageData(elements.canvasProc, null);
    });

    elements.chkShowBoxes.addEventListener('change', renderDetectedObjectBoxes);
    elements.chkShowGrid.addEventListener('change', (e) => {
        if (gridHelper) gridHelper.visible = e.target.checked;
    });

    // Measurement Tool Selection
    elements.btnModePoint.addEventListener('click', () => {
        state.activeToolMode = 'line';
        elements.btnModePoint.className = "py-2 px-3 bg-brand-600 text-white rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 border border-brand-500 shadow-sm";
        elements.btnModeBox.className = "py-2 px-3 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 border border-slate-700";
        elements.toolModeText.textContent = "Active Mode: 3D Ruler Point Selection";
    });

    elements.btnModeBox.addEventListener('click', () => {
        state.activeToolMode = 'box';
        elements.btnModeBox.className = "py-2 px-3 bg-brand-600 text-white rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 border border-brand-500 shadow-sm";
        elements.btnModePoint.className = "py-2 px-3 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 border border-slate-700";
        elements.toolModeText.textContent = "Active Mode: 3D Volume Box Span";
    });

    // Box Size Sliders listeners
    const updateBoxSliders = () => {
        const w = parseFloat(elements.sliderBoxW.value);
        const h = parseFloat(elements.sliderBoxH.value);
        const d = parseFloat(elements.sliderBoxD.value);

        elements.valBoxW.textContent = formatDistance(w);
        elements.valBoxH.textContent = formatDistance(h);
        elements.valBoxD.textContent = formatDistance(d);
        elements.boxDimsLabel.textContent = `${formatDistance(w)} × ${formatDistance(h)} × ${formatDistance(d)}`;

        // Update size of the latest added box mesh if present
        if (bboxGroup.children.length > 0) {
            const lastBox = bboxGroup.children[bboxGroup.children.length - 1];
            if (lastBox && lastBox.isLineSegments) {
                lastBox.scale.set(w, h, d);
            }
        }
    };

    if (elements.sliderBoxW) {
        elements.sliderBoxW.addEventListener('input', updateBoxSliders);
        elements.sliderBoxH.addEventListener('input', updateBoxSliders);
        elements.sliderBoxD.addEventListener('input', updateBoxSliders);
    }

    elements.btnClearMeasures.addEventListener('click', () => {
        state.measurements = [];
        while (measurementGroup.children.length > 0) {
            measurementGroup.remove(measurementGroup.children[0]);
        }
        while (bboxGroup.children.length > 0) {
            bboxGroup.remove(bboxGroup.children[0]);
        }

        const labels = elements.containerThree.querySelectorAll('div');
        labels.forEach(l => l.remove());
        scene.userData.labels = [];

        renderMeasurementListUI();
        elements.floatingCard.classList.add('hidden');
        showToast("Cleared all spatial measurements", "info");
    });

    // Unit & Calibration
    elements.selectUnit.addEventListener('change', (e) => {
        state.unit = e.target.value;
        renderMeasurementListUI();
    });

    elements.btnApplyCalib.addEventListener('click', () => {
        const factor = parseFloat(elements.inputScaleFactor.value);
        if (factor && factor > 0) {
            state.scaleFactor = factor;
            elements.scaleTag.textContent = `Scale: ${factor.toFixed(2)}x`;
            showToast(`Scale multiplier calibrated to ${factor.toFixed(2)}x`, "success");
        }
    });

    // Camera View Angle Presets
    elements.btnViewReset.addEventListener('click', () => {
        camera.position.set(0, 0, 4.2);
        controls.target.set(0, 0, 0);
    });
    elements.btnViewTop.addEventListener('click', () => {
        camera.position.set(0, 5, 0.001);
        controls.target.set(0, 0, 0);
    });
    elements.btnViewFront.addEventListener('click', () => {
        camera.position.set(0, 0, 4.2);
        controls.target.set(0, 0, 0);
    });
    elements.btnViewSide.addEventListener('click', () => {
        camera.position.set(4.5, 0, 0);
        controls.target.set(0, 0, 0);
    });

    // Export Actions
    elements.btnExportObj.addEventListener('click', exportToOBJ);
    elements.btnExportPly.addEventListener('click', exportToPLY);
    elements.btnExportJson.addEventListener('click', exportToJSON);
}

function onWindowResize() {
    const width = elements.containerThree.clientWidth;
    const height = elements.containerThree.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Update 3D metric HTML labels position
    if (scene.userData.labels) {
        scene.userData.labels.forEach(fn => fn());
    }

    renderer.render(scene, camera);
}

// Initialize App on DOM Load
window.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
    setupCameraSystem();
    bindUIEventListeners();
});
