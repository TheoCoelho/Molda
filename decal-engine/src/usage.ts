import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { DecalController } from "./engine/three/DecalController";
import { DecalPlacer } from "./engine/three/DecalPlacer";

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
  // Se usar DRACO:
  // const draco = new DRACOLoader();
  // draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  // loader.setDRACOLoader(draco);

  // ⚠️ Carrega o seu modelo (suporta ?model=scene.gltf ou ?model=tshirt.glb)
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

  // Decal placer (DecalGeometry)
  const placer = new DecalPlacer(scene, "/assets/logo.png");

  // Raycast (usa o root para considerar todas as submalhas)
  const ctrl = new DecalController(camera, root);

  // Garantir que eventos de pointer funcionem bem em conjunto com OrbitControls
  (renderer.domElement as HTMLCanvasElement).style.touchAction = "none";

  // Estado de arraste / primeiro clique
  let hasPlacedOnce = false;
  let dragging = false;
  let activeDecal: THREE.Mesh | null = null;
  let activeTargetMesh: THREE.Mesh | null = null;
  let activeWidth = 0;
  let activeHeight = 0;

  // Função utilitária para aplicar o logo na posição clicada usando DecalGeometry
  const applyLogoAtClientPoint = async (clientX: number, clientY: number) => {
    if (hasPlacedOnce) return;
    const hit = ctrl.pickHit(clientX, clientY, renderer.domElement);
    if (!hit || !hit.point || !hit.face) return;
    // Sobe na hierarquia até encontrar um Mesh
    let base = hit.object as THREE.Object3D;
    while (base && !(base as any).isMesh) base = base.parent!;
    if (!base) return;
    const mesh = base as THREE.Mesh;
    const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
    // Tamanho MUITO grande relativo ao modelo
    const bbox = new THREE.Box3().setFromObject(root);
    const bboxSize = bbox.getSize(new THREE.Vector3());
    const major = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
    const width = major * 0.6; // 60% do maior lado do modelo
    const height = width * 0.5;
    await placer.place(mesh, hit.point, normal, { width, height });
    hasPlacedOnce = true;
  };

  // Clique: aplica o logo e inicia drag
  renderer.domElement.addEventListener("pointerdown", async (ev) => {
    if (hasPlacedOnce && !activeDecal) return; // não cria outro
    const hit = ctrl.pickHit(ev.clientX, ev.clientY, renderer.domElement);
    if (!hit || !hit.point || !hit.face) return;
    let base = hit.object as THREE.Object3D;
    while (base && !(base as any).isMesh) base = base.parent!;
    if (!base) return;
    const mesh = base as THREE.Mesh;
    const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();

    // Tamanho grande baseado no modelo (se ainda não existir)
    if (!activeDecal) {
      const bbox = new THREE.Box3().setFromObject(root);
      const bboxSize = bbox.getSize(new THREE.Vector3());
      const major = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
      activeWidth = major * 0.6;
      activeHeight = activeWidth * 0.5;
      activeDecal = await placer.place(mesh, hit.point, normal, { width: activeWidth, height: activeHeight });
      activeTargetMesh = mesh;
      hasPlacedOnce = true;
    }
    dragging = true;
  });

  renderer.domElement.addEventListener("pointermove", async (ev) => {
    if (!dragging || !activeDecal || !activeTargetMesh) return;
    const hit = ctrl.pickHit(ev.clientX, ev.clientY, renderer.domElement);
    if (!hit || !hit.point || !hit.face) return;
    const mesh = activeTargetMesh;
    const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
    await placer.update(activeDecal, mesh, hit.point, normal, { width: activeWidth, height: activeHeight });
  });

  renderer.domElement.addEventListener("pointerup", () => {
    dragging = false;
  });

  // Removido: não aplicar automaticamente no centro; apenas no primeiro clique do usuário

  // Resize responsivo
  const onResize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(onResize).observe(container);

  // Loop
  const tick = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();
}
