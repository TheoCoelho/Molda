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
  menu.style.fontFamily =
    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
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
  camera.position.set(2, 1.5, 2);
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

  // ---- decal: estado e dimensões ----
  let decalWidth = 0.3;
  let decalHeight = 0.3;
  let decalDepth = Math.max(decalWidth, decalHeight) * 2.0;
  let decalAngle = 0;
  let decalCenter = new THREE.Vector3();
  let decalNormal = new THREE.Vector3(0, 0, 1);

  // ---- raycast (com a correção de API) ----
  function hitAt(clientX: number, clientY: number) {
    if (!root) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const mouse = new THREE.Vector2(x, y);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(root, true);
    if (!hits.length) return null;
    const h = hits[0];
    const p = h.point.clone();
    let n = new THREE.Vector3(0, 1, 0);
    if (h.face) {
      n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
    }
    return { point: p, normal: n };
  }

  // ---- overlay SVG (gizmo) ----
  const svgNS = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(svgNS, "svg");
  overlay.setAttribute("xmlns", svgNS);
  overlay.style.position = "absolute";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  container.appendChild(overlay);

  function makeHandle(r = 6) {
    const h = document.createElementNS(svgNS, "rect");
    h.setAttribute("width", String(r * 2));
    h.setAttribute("height", String(r * 2));
    h.setAttribute("fill", "#fff");
    h.setAttribute("stroke", "#7c3aed");
    h.setAttribute("stroke-width", "2");
    h.setAttribute("rx", "4");
    h.setAttribute("ry", "4");
    h.style.pointerEvents = "auto";
    h.style.cursor = "pointer";
    return h;
  }

  const boxPoly = document.createElementNS(svgNS, "polyline");
  boxPoly.setAttribute("fill", "rgba(124,58,237,0.06)");
  boxPoly.setAttribute("stroke", "#7c3aed");
  boxPoly.setAttribute("stroke-width", "2");
  overlay.appendChild(boxPoly);

  const handles = {
    tl: makeHandle(), tm: makeHandle(), tr: makeHandle(),
    ml: makeHandle(), mr: makeHandle(),
    bl: makeHandle(), bm: makeHandle(), br: makeHandle(),
    rot: makeHandle(),
  };
  Object.values(handles).forEach((h) => overlay.appendChild(h));

  const rotLine = document.createElementNS(svgNS, "line");
  rotLine.setAttribute("stroke", "#7c3aed");
  rotLine.setAttribute("stroke-width", "2");
  overlay.appendChild(rotLine);

  function setHandlePos(h: SVGRectElement, x: number, y: number) {
    const s = Number(h.getAttribute("width")) / 2;
    h.setAttribute("x", String(x - s));
    h.setAttribute("y", String(y - s));
  }
  function toScreen(p: THREE.Vector3) {
    const v = p.clone().project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      (v.x * 0.5 + 0.5) * r.width,
      (-v.y * 0.5 + 0.5) * r.height
    );
  }
  function showOverlay(v: boolean) {
    overlay.style.display = v ? "block" : "none";
  }

  function basisFromNormal(normal: THREE.Vector3, angle: number) {
    // right/up no plano do decal
    const upCand =
      Math.abs(normal.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const right0 = upCand.clone().cross(normal).normalize();
    const up0 = normal.clone().cross(right0).normalize();
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const right = right0.clone().multiplyScalar(c).add(up0.clone().multiplyScalar(s)).normalize();
    const up = up0.clone().multiplyScalar(c).sub(right0.clone().multiplyScalar(s)).normalize();
    return { right, up };
  }

  function updateOverlay() {
    if (!projector) return;
    // centro = posição atual do projetor (mantemos copia em decalCenter também)
    const center = decalCenter.clone();
    const { right, up } = basisFromNormal(decalNormal, decalAngle);
    const hx = decalWidth * 0.5;
    const hy = decalHeight * 0.5;

    const pTL = center.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(hy));
    const pTR = center.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(hy));
    const pBR = center.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(-hy));
    const pBL = center.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(-hy));

    const sTL = toScreen(pTL), sTR = toScreen(pTR),
          sBR = toScreen(pBR), sBL = toScreen(pBL);

    const pts = [sTL, sTR, sBR, sBL, sTL].map((p) => `${p.x},${p.y}`).join(" ");
    boxPoly.setAttribute("points", pts);

    setHandlePos(handles.tl, sTL.x, sTL.y);
    setHandlePos(handles.tr, sTR.x, sTR.y);
    setHandlePos(handles.br, sBR.x, sBR.y);
    setHandlePos(handles.bl, sBL.x, sBL.y);
    setHandlePos(handles.tm, (sTL.x + sTR.x) / 2, (sTL.y + sTR.y) / 2);
    setHandlePos(handles.bm, (sBL.x + sBR.x) / 2, (sBL.y + sBR.y) / 2);
    setHandlePos(handles.ml, (sTL.x + sBL.x) / 2, (sTL.y + sBL.y) / 2);
    setHandlePos(handles.mr, (sTR.x + sBR.x) / 2, (sTR.y + sBR.y) / 2);

    // handle de rotação 24px “para fora” do topo
    const topMid = new THREE.Vector2((sTL.x + sTR.x) / 2, (sTL.y + sTR.y) / 2);
    const dirUp2D = new THREE.Vector2(sTL.y - sTR.y, sTR.x - sTL.x).normalize();
    const rotAnchor = topMid.clone();
    const rotHandle = topMid.clone().add(dirUp2D.multiplyScalar(24));
    rotLine.setAttribute("x1", String(rotAnchor.x));
    rotLine.setAttribute("y1", String(rotAnchor.y));
    rotLine.setAttribute("x2", String(rotHandle.x));
    rotLine.setAttribute("y2", String(rotHandle.y));
    setHandlePos(handles.rot, rotHandle.x, rotHandle.y);

    showOverlay(true);
  }

  // ---- arrasto original (mover decal com clique na malha) ----
  let draggingMesh = false;
  function attachDragHandlers() {
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (ev) => {
      if (!projector) return;
      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return;
      draggingMesh = true;
      decalCenter.copy(h.point);
      decalNormal.copy(h.normal);
      projector.setTransform(
        decalCenter,
        decalNormal,
        decalWidth,
        decalHeight,
        decalDepth,
        decalAngle
      );
      controls.enabled = false;
      updateOverlay();
    });
    el.addEventListener("pointermove", (ev) => {
      if (!draggingMesh || !projector) return;
      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return;
      decalCenter.copy(h.point);
      decalNormal.copy(h.normal);
      projector.setTransform(
        decalCenter,
        decalNormal,
        decalWidth,
        decalHeight,
        decalDepth,
        decalAngle
      );
      updateOverlay();
    });
    el.addEventListener("pointerup", () => {
      draggingMesh = false;
      controls.enabled = true;
    });
    el.addEventListener("pointerleave", () => {
      draggingMesh = false;
      controls.enabled = true;
    });
  }

  // ---- interações do GIZMO (redimensionar + rotacionar + mover no overlay) ----
  type DragMode =
    | "move"
    | "scale-tl" | "scale-tr" | "scale-br" | "scale-bl"
    | "scale-tm" | "scale-bm" | "scale-ml" | "scale-mr"
    | "rotate"
    | null;

  let dragMode: DragMode = null;
  let dragPlane: THREE.Plane | null = null;
  let startCenter = new THREE.Vector3();
  let startW = 0, startH = 0, startA = 0;

  function startDrag(mode: DragMode, ev: PointerEvent) {
    if (!projector) return;
    dragMode = mode;
    startCenter.copy(decalCenter);
    startW = decalWidth; startH = decalHeight; startA = decalAngle;
    dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      decalNormal,
      decalCenter
    );
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }
  function endDrag(ev: PointerEvent) {
    dragMode = null;
    dragPlane = null;
    (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  }

  const overlayRay = new THREE.Raycaster();
  function planeHit(clientX: number, clientY: number, plane: THREE.Plane) {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    overlayRay.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return overlayRay.ray.intersectPlane(plane, p) ? p : null;
  }

  function onPointerMoveOverlay(ev: PointerEvent) {
    if (!projector || !dragMode || !dragPlane) return;
    ev.preventDefault();

    const p = planeHit(ev.clientX, ev.clientY, dragPlane);
    if (!p) return;

    // eixos locais (após rotação)
    const { right, up } = basisFromNormal(decalNormal, startA);
    const rel = p.clone().sub(startCenter);
    const x = rel.dot(right);
    const y = rel.dot(up);

    if (dragMode === "move") {
      decalCenter.copy(p);
    } else if (dragMode.startsWith("scale-")) {
      // redimensiona simétrico ao centro (como Photoshop)
      if (dragMode === "scale-tm" || dragMode === "scale-bm") {
        decalWidth = startW;
        decalHeight = Math.max(1e-4, 2 * Math.abs(y));
      } else if (dragMode === "scale-ml" || dragMode === "scale-mr") {
        decalWidth = Math.max(1e-4, 2 * Math.abs(x));
        decalHeight = startH;
      } else {
        decalWidth = Math.max(1e-4, 2 * Math.abs(x));
        decalHeight = Math.max(1e-4, 2 * Math.abs(y));
      }
      decalDepth = Math.max(decalWidth, decalHeight) * 2.0;
    } else if (dragMode === "rotate") {
      // ângulo entre eixo Right e vetor centro->p
      decalAngle = Math.atan2(y, x);
    }

    projector.setTransform(
      decalCenter,
      decalNormal,
      decalWidth,
      decalHeight,
      decalDepth,
      decalAngle
    );
    updateOverlay();
  }

  function bindHandle(h: SVGRectElement, mode: DragMode) {
    h.addEventListener("pointerdown", (ev) => startDrag(mode, ev));
    window.addEventListener("pointermove", onPointerMoveOverlay);
    window.addEventListener("pointerup", endDrag);
  }
  bindHandle(handles.tl, "scale-tl");
  bindHandle(handles.tr, "scale-tr");
  bindHandle(handles.br, "scale-br");
  bindHandle(handles.bl, "scale-bl");
  bindHandle(handles.tm, "scale-tm");
  bindHandle(handles.bm, "scale-bm");
  bindHandle(handles.ml, "scale-ml");
  bindHandle(handles.mr, "scale-mr");
  bindHandle(handles.rot, "rotate");

  // mover pelo overlay (clicando dentro do retângulo)
  overlay.addEventListener("pointerdown", (ev) => {
    const tag = (ev.target as Element).tagName.toLowerCase();
    if (tag === "rect") return; // é uma alça
    startDrag("move", ev);
  });

  // ---- projeção da logo (paths intactos) ----
  function initLogoProjection(targetRoot: THREE.Object3D) {
    const texLoader = new THREE.TextureLoader();
    texLoader.load(
      "/logo.png",
      (logoTex) => {
        logoTex.wrapS = THREE.ClampToEdgeWrapping;
        logoTex.wrapT = THREE.ClampToEdgeWrapping;
        logoTex.minFilter = THREE.LinearMipmapLinearFilter;
        logoTex.magFilter = THREE.LinearFilter;
        // sRGB compat
        if ("colorSpace" in (logoTex as any))
          (logoTex as any).colorSpace = THREE.SRGBColorSpace;
        else (logoTex as any).encoding = THREE.sRGBEncoding;

        projector = new ProjectionDecal(logoTex, {
          useFeather: true,
          feather: 0.1,
          strength: 1.0,
        });
        projector.attachTo(targetRoot);

        // tamanho/centro iniciais
        const bbox = new THREE.Box3().setFromObject(targetRoot);
        const size = bbox.getSize(new THREE.Vector3());
        const base = Math.max(size.x, size.y, size.z) || 1.0;
        decalWidth = base * 0.25;
        decalHeight = decalWidth;
        decalDepth = Math.max(decalWidth, decalHeight) * 2.0;

        // centro inicial no ponto médio frontal
        const c = bbox.getCenter(new THREE.Vector3());
        decalCenter.set(c.x, c.y, bbox.max.z + 0.02);
        decalNormal.set(0, 0, 1);
        decalAngle = 0;

        projector.setTransform(
          decalCenter,
          decalNormal,
          decalWidth,
          decalHeight,
          decalDepth,
          decalAngle
        );
        updateOverlay();
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

      const bbox = new THREE.Box3().setFromObject(root);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());

      const radius = size.length() * 0.5 || 1;
      const fov = (camera.fov * Math.PI) / 180;
      const dist = radius / Math.sin(fov / 2);

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
    updateOverlay();
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
