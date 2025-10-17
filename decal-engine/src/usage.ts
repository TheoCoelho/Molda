import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { DecalController } from "./engine/three/DecalController";
import ProjectionDecal from "./engine/three/ProjectionDecal";

export async function initDecalDemo(container: HTMLElement) {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);

  // Compat: outputColorSpace (r152+) vs outputEncoding (<= r151)
  if ("outputColorSpace" in renderer) {
    (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
  } else {
    (renderer as any).outputEncoding = THREE.sRGBEncoding;
  }
  container.appendChild(renderer.domElement);

  // Cena / câmera / controles
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(2, 2, 2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Luzes
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  // Grid opcional
  const grid = new THREE.GridHelper(10, 20, 0x333333, 0x222222);
  scene.add(grid);

  // Loader GLTF/GLB
  const loader = new GLTFLoader();
  // const draco = new DRACOLoader();
  // draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  // loader.setDRACOLoader(draco);

  // Carrega o seu modelo
  const params = new URLSearchParams(window.location.search);
  const modelFile = params.get("model") || "scene.gltf";
  const gltf = await loader.loadAsync(`/assets/${modelFile}`);
  const root = gltf.scene;
  scene.add(root);

  // Normaliza posição/escala e enquadra câmera
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.sub(center);
  root.updateMatrixWorld(true);

  const radius = size.length() * 0.5 || 1;
  const fov = (camera.fov * Math.PI) / 180;
  const dist = radius / Math.sin(fov / 2);
  camera.position.set(0, 0, dist * 1.2);
  camera.near = Math.max(0.01, dist / 1000);
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();

  // ---------------------------
  // PROJEÇÃO DO LOGO (sem corte/deformação)
  // ---------------------------
  const texLoader = new THREE.TextureLoader();
  const logoTexture = await texLoader.loadAsync("/assets/logo.png");

  // Aspect ratio real da imagem
  const imgW = (logoTexture.image as HTMLImageElement)?.naturalWidth ?? (logoTexture.image?.width ?? 1);
  const imgH = (logoTexture.image as HTMLImageElement)?.naturalHeight ?? (logoTexture.image?.height ?? 1);
  const aspect = imgW / imgH;

  // Cria o projetor (flags de corte DESLIGADAS por padrão)
  const projector = new ProjectionDecal(logoTexture, {
    clipRect: false,      // não recorta em UV
    clipDepth: false,     // não recorta por profundidade
    useAngleClamp: false, // sem clamp angular (mostra inteiro)
    frontOnly: true,      // evita projetar atrás
    useFeather: false,    // sem feather para manter borda exata da arte
    strength: 1.0,
  });

  // Anexa a projeção ao modelo
  projector.attachTo(root);

  // Tamanho inicial proporcional ao modelo e respeitando o aspect da imagem
  const bbox = new THREE.Box3().setFromObject(root);
  const bboxSize = bbox.getSize(new THREE.Vector3());
  const major = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
  let activeWidth = major * 0.6;       // largura em mundo
  let activeHeight = activeWidth / aspect; // altura preservando aspect

  // Raycast
  const ctrl = new DecalController(camera, root);
  (renderer.domElement as HTMLCanvasElement).style.touchAction = "none";

  // Arrasto
  let dragging = false;

  function pickHit(clientX: number, clientY: number) {
    return ctrl.pickHit(clientX, clientY, renderer.domElement);
  }

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    const hit = pickHit(ev.clientX, ev.clientY);
    if (!hit || !hit.point) return;

    let base = hit.object as THREE.Object3D;
    while (base && !(base as any).isMesh) base = base.parent!;
    if (!base) return;

    const mesh = base as THREE.Mesh;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    // Profundidade MUITO maior que ondulações da malha para não cortar
    const depth = Math.max(activeWidth, activeHeight) * 2.0;

    projector.setTransform(hit.point.clone(), normal, activeWidth, activeHeight, depth);
    projector.update();
    dragging = true;
  });

  renderer.domElement.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const hit = pickHit(ev.clientX, ev.clientY);
    if (!hit || !hit.point) return;

    let base = hit.object as THREE.Object3D;
    while (base && !(base as any).isMesh) base = base.parent!;
    if (!base) return;

    const mesh = base as THREE.Mesh;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    const depth = Math.max(activeWidth, activeHeight) * 2.0;
    projector.setTransform(hit.point.clone(), normal, activeWidth, activeHeight, depth);
    projector.update();
  });

  renderer.domElement.addEventListener("pointerup", () => {
    dragging = false;
  });

  // Zoom do logo mantendo aspecto
  renderer.domElement.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 0.95 : 1.05;
      activeWidth *= factor;
      activeHeight = activeWidth / aspect;

      const pos = projector.object.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(
        projector.object.getWorldQuaternion(new THREE.Quaternion())
      ).normalize();

      const depth = Math.max(activeWidth, activeHeight) * 2.0;
      projector.setTransform(pos, dir, activeWidth, activeHeight, depth);
      projector.update();
    },
    { passive: false }
  );

  // Resize
  const onResize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(onResize).observe(container);

  // Loop
  const tick = () => {
    controls.update();
    projector.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();
}
