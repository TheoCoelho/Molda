// src/usage.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import ProjectionDecal from "./engine/three/ProjectionDecal";

export async function initDecalDemo(container: HTMLElement): Promise<void> {
  // ---------------- MENU (mantido como antes) ----------------
  const models = [
    { label: "Manga Longa", value: "long_sleeve_t-shirt/scene.gltf" },
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
  menu.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  menu.style.display = "flex";
  menu.style.gap = "8px";
  models.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m.label;
    btn.style.padding = "6px 10px";
    btn.style.border = "none";
    btn.style.borderRadius = "6px";
    btn.style.background = "#4a4a4a";
    btn.style.color = "#fff";
    btn.style.cursor = "pointer";
    btn.onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("model", m.value);
      window.location.href = url.toString();
    };
    menu.appendChild(btn);
  });
  container.appendChild(menu);

  // ---------------- Renderer / cena / câmera ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(2, 1.5, 2); // inicial; será recalculada após o GLTF
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // ---------------- Luzes ----------------
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  // ---------------- Container do modelo ----------------
  const modelContainer = new THREE.Group();
  scene.add(modelContainer);

  function centerOnGrid(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    object.position.x -= center.x;
    object.position.z -= center.z;
    const yMin = box.min.y - center.y;
    object.position.y -= yMin;
  }

  // ---------------- Carregar GLTF (paths intactos) ----------------
  const params = new URLSearchParams(window.location.search);
  const modelFile = params.get("model") || "tshirt_model/scene.gltf";
  const modelUrl = `/models/${modelFile}`;
  const loader = new GLTFLoader();

  let root: THREE.Object3D | null = null;
  let projector: ProjectionDecal | null = null;

  // ---- decal: apenas arrasto (como no original) ----
  let decalWidth = 0.3;
  let decalHeight = 0.3;
  const decalDepth = Math.max(decalWidth, decalHeight) * 2.0;
  let decalAngle = 0;

  // ---- raycast (com a correção de API) ----
  function hitAt(clientX: number, clientY: number) {
    if (!root) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const mouse = new THREE.Vector2(x, y);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(root, true); // <- correto
    if (!hits.length) return null;
    const h = hits[0];
    const p = h.point.clone();
    let n = new THREE.Vector3(0, 1, 0);
    if (h.face) {
      n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
    }
    return { point: p, normal: n };
  }

  // ---- arrasto mínimo da projeção ----
  let dragging = false;
  function attachDragHandlers() {
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (ev) => {
      if (!projector) return;
      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return;
      dragging = true;
      projector.setTransform(h.point, h.normal, decalWidth, decalHeight, decalDepth, decalAngle);
      controls.enabled = false;
    });
    el.addEventListener("pointermove", (ev) => {
      if (!dragging || !projector) return;
      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return;
      projector.setTransform(h.point, h.normal, decalWidth, decalHeight, decalDepth, decalAngle);
    });
    el.addEventListener("pointerup", () => {
      dragging = false;
      controls.enabled = true;
    });
    el.addEventListener("pointerleave", () => {
      dragging = false;
      controls.enabled = true;
    });
  }

  // ---- projeção da logo (paths intactos) ----
  function initLogoProjection(targetRoot: THREE.Object3D) {
    const texLoader = new THREE.TextureLoader();
    texLoader.load(
      "/logo.png", // mantenha como estava no seu projeto
      (logoTex) => {
        logoTex.wrapS = THREE.ClampToEdgeWrapping;
        logoTex.wrapT = THREE.ClampToEdgeWrapping;
        logoTex.minFilter = THREE.LinearMipmapLinearFilter;
        logoTex.magFilter = THREE.LinearFilter;
        // sRGB compat
        if ("colorSpace" in (logoTex as any)) (logoTex as any).colorSpace = THREE.SRGBColorSpace;
        else (logoTex as any).encoding = THREE.sRGBEncoding;

        projector = new ProjectionDecal(logoTex, {
          useFeather: true,
          feather: 0.1,
          strength: 1.0,
        });
        projector.attachTo(targetRoot);

        const bbox = new THREE.Box3().setFromObject(targetRoot);
        const size = bbox.getSize(new THREE.Vector3());
        const base = Math.max(size.x, size.y, size.z) || 1.0;
        decalWidth = base * 0.25;
        decalHeight = decalWidth;

        const center = bbox.getCenter(new THREE.Vector3());
        const front = new THREE.Vector3(center.x, center.y, bbox.max.z + 0.02);
        const normal = new THREE.Vector3(0, 0, 1);
        projector.setTransform(front, normal, decalWidth, decalHeight, decalDepth, decalAngle);
      },
      undefined,
      (err) => console.error("Falha ao carregar logo.png:", err)
    );
  }

  // ---------------- Load e enquadramento da câmera ----------------
  loader.load(
    modelUrl,
    (gltf) => {
      modelContainer.clear();
      root = gltf.scene;
      centerOnGrid(root);
      modelContainer.add(root);

      // bbox do modelo já centralizado no grid
      const bbox = new THREE.Box3().setFromObject(root);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());

      // distância para enquadrar (mantida)
      const radius = size.length() * 0.5 || 1;
      const fov = (camera.fov * Math.PI) / 180;
      const dist = radius / Math.sin(fov / 2);

      // ✅ ÚNICA ALTERAÇÃO: Y da câmera = center.y (mesma altura do modelo)
      camera.position.set(0.8 * dist, center.y, dist);
      camera.lookAt(center.x, center.y, center.z);
      controls.target.copy(center);
      controls.update();

      initLogoProjection(root);
      attachDragHandlers();
    },
    undefined,
    (err) => console.error("Falha ao carregar GLTF:", err)
  );

  // ---------------- Resize ----------------
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  new ResizeObserver(onResize).observe(container);

  // ---------------- Loop ----------------
  const tick = () => {
    controls.update();
    if (projector) projector.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();
}

export default initDecalDemo;
