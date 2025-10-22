import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { DecalController } from "./engine/three/DecalController";
import ProjectionDecal from "./engine/three/ProjectionDecal";

export async function initDecalDemo(container: HTMLElement) {
  // --- Projeção da imagem logo.png sobre o modelo 3D ---
  // Deve ocorrer após o carregamento do modelo 3D (root)
  // --- Menu de seleção de modelos ---
  const models = [
    { label: "Manga Longa", value: "long_sleeve_t-_shirt/scene.gltf" },
    { label: "Oversized", value: "oversize_t-shirt_free/scene.gltf" },
    { label: "Low Poly", value: "t-shirt_low_poly/scene.gltf" },
    { label: "TShirt Model", value: "tshirt_model/scene.gltf" },
  ];

  const menu = document.createElement("div");
  menu.style.position = "absolute";
  menu.style.top = "10px";
  menu.style.left = "10px";
  menu.style.zIndex = "1000";
  menu.style.background = "rgba(30,30,30,0.85)";
  menu.style.padding = "8px 12px";
  menu.style.borderRadius = "8px";
  menu.style.color = "#fff";
  menu.style.fontFamily = "sans-serif";
  menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

  models.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m.label;
    btn.style.margin = "0 6px 0 0";
    btn.style.padding = "6px 12px";
    btn.style.border = "none";
    btn.style.borderRadius = "5px";
    btn.style.background = "#444";
    btn.style.color = "#fff";
    btn.style.cursor = "pointer";
    btn.onmouseenter = () => (btn.style.background = "#666");
    btn.onmouseleave = () => (btn.style.background = "#444");
    btn.onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("model", m.value);
      window.location.href = url.toString();
    };
    menu.appendChild(btn);
  });
  container.appendChild(menu);
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
  // Corrigido: buscar modelos em /models/ para testes
  const gltf = await loader.loadAsync(`/models/${modelFile}`);
  const root = gltf.scene;
  scene.add(root);

  // Projeção da logo.png sobre o modelo carregado
  const texLoader = new THREE.TextureLoader();
  texLoader.load("/logo.png", (logoTexture) => {
    // Aspect ratio real da imagem
    const imgW = (logoTexture.image as HTMLImageElement)?.naturalWidth ?? (logoTexture.image?.width ?? 1);
    const imgH = (logoTexture.image as HTMLImageElement)?.naturalHeight ?? (logoTexture.image?.height ?? 1);
    const aspect = imgW / imgH;

    // Cria o projetor (flags de corte DESLIGADAS por padrão)
    const projector = new ProjectionDecal(logoTexture, {
  clipRect: false,
  clipDepth: false,
  useAngleClamp: false,
  frontOnly: true,
  useFeather: true,
  feather: 0.12,
  strength: 1.0,
    });
    projector.attachTo(root);

    // Tamanho inicial proporcional ao modelo e respeitando o aspect da imagem
    const bbox = new THREE.Box3().setFromObject(root);
    const bboxSize = bbox.getSize(new THREE.Vector3());
    const major = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
  let activeWidth = major * 0.25; // reduzido para 25% do maior lado do modelo
  let activeHeight = activeWidth / aspect;

    // Centraliza e orienta a projeção no centro do modelo, normal para cima
  const center = bbox.getCenter(new THREE.Vector3());
  // Projeta do eixo Z positivo (frente para trás)
  const normal = new THREE.Vector3(0, 0, 1);
  projector.setTransform(center, normal, activeWidth, activeHeight);

    // Permitir arrastar a projeção com mouse/touch
    let dragging = false;
    function getHitPoint(clientX, clientY) {
      // Raycast para pegar ponto na superfície do modelo
      const mouse = new THREE.Vector2(
        (clientX / renderer.domElement.clientWidth) * 2 - 1,
        -(clientY / renderer.domElement.clientHeight) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(root, true);
      return intersects[0]?.point;
    }

    renderer.domElement.addEventListener("pointerdown", (ev) => {
      dragging = true;
    });
    renderer.domElement.addEventListener("pointerup", () => {
      dragging = false;
    });
    renderer.domElement.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const point = getHitPoint(ev.clientX, ev.clientY);
      if (point) {
        // Mantém o tamanho fixo, não recalcula activeWidth/activeHeight
        projector.setTransform(point, normal, activeWidth, activeHeight);
      }
    });

    // Reduz profundidade para minimizar "wrap" e distorção
    const depth = Math.max(activeWidth, activeHeight) * 0.15;

    // Atualiza projeção no loop
    function tickWithLogo() {
      controls.update();
      projector.update();
      renderer.render(scene, camera);
      requestAnimationFrame(tickWithLogo);
    }
    tickWithLogo();
  });

  // Normaliza posição/escala e enquadra câmera
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Centraliza o modelo no grid, base alinhada ao plano Y=0
  root.position.sub(center);
  // Move para que a base do modelo fique no grid
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  // Ajusta a câmera para olhar de frente
  camera.position.set(0, 1.2, 3.5);
  camera.lookAt(0, 0.5, 0);

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
  // Projeção de logo removida para evitar erro de arquivo inexistente

  // Interações de decalque removidas: exibe apenas o modelo 3D normalmente

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
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();
}
