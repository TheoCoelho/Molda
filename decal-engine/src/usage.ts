// src/usage.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import MeshDecalAdapter from "./engine/three/MeshDecalAdapter";

export type ExternalDecalPayload = {
  id: string;
  label?: string;
  src: string;
  width?: number;
  height?: number;
  depth?: number;
  angle?: number;
};

export type DecalDemoHandle = {
  upsertExternalDecal: (payload: ExternalDecalPayload) => void;
  removeExternalDecal: (id: string) => void;
};

export async function initDecalDemo(container: HTMLElement): Promise<DecalDemoHandle> {
  // ---------------- MENU ----------------
  const params0 = new URLSearchParams(window.location.search);
  const hideMenu = params0.get("hideMenu") === "1" || params0.get("hideMenu") === "true";
  if (!hideMenu) {
  const models = [
    { label: "Manga Longa", value: "long_sleeve_t-_shirt/scene.gltf" },
    { label: "Oversized", value: "oversize_t-shirt_free/scene.gltf" },
    { label: "Low Poly", value: "t-shirt_low_poly/scene.gltf" },
    { label: "TShirt Model", value: "tshirt_model/scene.gltf" },
  ];
  const menu = document.createElement("div");
  Object.assign(menu.style, {
    position: "absolute",
    top: "10px",
    left: "10px",
    zIndex: "1000",
    background: "rgba(30,30,30,0.85)",
    padding: "8px 12px",
    borderRadius: "8px",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex",
    gap: "8px",
  } as CSSStyleDeclaration);
  models.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m.label;
    Object.assign(btn.style, {
      padding: "6px 10px",
      border: "none",
      borderRadius: "6px",
      background: "#4a4a4a",
      color: "#fff",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    btn.onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("model", m.value);
      window.location.href = url.toString();
    };
    menu.appendChild(btn);
  });
  container.appendChild(menu);
  }

  const galleryPanel = document.createElement("div");
  Object.assign(galleryPanel.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    zIndex: "1000",
    background: "rgba(30,30,30,0.85)",
    padding: "10px",
    borderRadius: "8px",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    width: "200px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
  } as CSSStyleDeclaration);
  container.appendChild(galleryPanel);

  const galleryTitle = document.createElement("div");
  galleryTitle.textContent = "Galeria";
  Object.assign(galleryTitle.style, {
    fontWeight: "600",
    fontSize: "14px",
    letterSpacing: "0.4px",
    textTransform: "uppercase",
  } as CSSStyleDeclaration);
  galleryPanel.appendChild(galleryTitle);

  const galleryActions = document.createElement("div");
  Object.assign(galleryActions.style, {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  } as CSSStyleDeclaration);
  galleryPanel.appendChild(galleryActions);

  const addImageButton = document.createElement("button");
  addImageButton.textContent = "+ Imagem";
  Object.assign(addImageButton.style, {
    flex: "1",
    padding: "6px 10px",
    border: "none",
    borderRadius: "6px",
    background: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
    fontSize: "12px",
    transition: "background 0.2s ease",
  } as CSSStyleDeclaration);
  addImageButton.onmouseenter = () => {
    addImageButton.style.background = "#8b5cf6";
  };
  addImageButton.onmouseleave = () => {
    addImageButton.style.background = "#7c3aed";
  };
  galleryActions.appendChild(addImageButton);

  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/*";
  uploadInput.multiple = true;
  uploadInput.style.display = "none";
  galleryPanel.appendChild(uploadInput);

  const galleryEmptyLabel = document.createElement("div");
  galleryEmptyLabel.textContent = "Nenhuma imagem adicionada.";
  Object.assign(galleryEmptyLabel.style, {
    fontSize: "12px",
    opacity: "0.7",
  } as CSSStyleDeclaration);
  galleryPanel.appendChild(galleryEmptyLabel);

  const galleryThumbs = document.createElement("div");
  Object.assign(galleryThumbs.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "6px",
  } as CSSStyleDeclaration);
  galleryPanel.appendChild(galleryThumbs);

  addImageButton.addEventListener("click", () => uploadInput.click());
  uploadInput.addEventListener("change", () => {
    handleFileList(uploadInput.files);
    uploadInput.value = "";
  });

  type ProjectorLike = {
    setTransform: (
      position: THREE.Vector3,
      normal: THREE.Vector3,
      width: number,
      height: number,
      depth: number,
      angleRad: number
    ) => void;
    attachTo: (obj: THREE.Object3D) => void;
    update: () => void;
    updateTexture?: (texture: THREE.Texture) => void;
    dispose?: () => void;
    getMesh?: () => THREE.Mesh | null;
  };

  let root: THREE.Object3D | null = null;
  let projector: ProjectorLike | null = null;
  const textureLoader = new THREE.TextureLoader();

  type GalleryItem = {
    id: string;
    label: string;
    src: string;
    texture?: THREE.Texture;
    hidden?: boolean;
  };

  const galleryState = {
    items: [] as GalleryItem[],
    activeId: "",
    selectedIds: new Set<string>(),
  };

  type DecalRecord = {
    id: string;
    galleryItemId: string;
    projector: ProjectorLike;
    texture: THREE.Texture;
    width: number;
    height: number;
    depth: number;
    angle: number;
    center: THREE.Vector3;
    normal: THREE.Vector3;
    mesh: THREE.Mesh | null;
  };

  const decals = new Map<string, DecalRecord>();
  let activeDecalId: string | null = null;
  const pendingExternalDecals = new Set<string>();

  let defaultWidth = 0.3;
  let defaultHeight = 0.3;
  let defaultDepth = 0.3;
  const defaultCenter = new THREE.Vector3(0, 0.5, 0.2);
  const defaultNormal = new THREE.Vector3(0, 0, 1);

  const decalRaycaster = new THREE.Raycaster();

  const projectorOptions = {
    angleClampDeg: 92,
    depthFromSizeScale: 0.2,
    frontOnly: true,
    frontHalfOnly: false,
    sliverAspectMin: 0.001,
    areaMin: 1e-8,
    zBandFraction: 0.6,
    zBandMin: 0.015,
    maxRadiusFraction: 1.0,
    maxDepthScale: 1.0,
  };

  function getGalleryItemById(id: string): GalleryItem | null {
    return galleryState.items.find((g) => g.id === id) ?? null;
  }

  function handleThumbClick(id: string) {
    const item = getGalleryItemById(id);
    if (!item) return;
    if (!galleryState.selectedIds.has(id)) {
      galleryState.selectedIds.add(id);
      ensureDecalForGalleryItem(item, true);
    } else {
      setActiveDecal(id);
    }
    renderGallery();
  }

  function handleRemoveDecal(id: string) {
    galleryState.selectedIds.delete(id);
    removeDecalForGalleryItem(id);
    if (galleryState.selectedIds.size === 0) {
      setActiveDecal(null);
    } else if (!galleryState.selectedIds.has(galleryState.activeId)) {
      const next = galleryState.selectedIds.values().next().value as string | undefined;
      setActiveDecal(next ?? null);
    }
    renderGallery();
  }

  function addGalleryItem(src: string, label: string, activate = false) {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `img-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const item: GalleryItem = { id, label, src };
    galleryState.items.push(item);
    if (activate) {
      galleryState.selectedIds.add(id);
      ensureDecalForGalleryItem(item, true);
      galleryState.activeId = id;
    }
    renderGallery();
    return item;
  }

  function handleFileList(list: FileList | null) {
    if (!list || !list.length) return;
    const files = Array.from(list);
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const label = file.name || `Imagem ${galleryState.items.length + 1}`;
        const activate = files.length === 1 || index === files.length - 1;
        addGalleryItem(reader.result, label, activate);
      };
      reader.onerror = () => {
        console.error("Falha ao ler arquivo de imagem:", file.name);
      };
      reader.readAsDataURL(file);
    });
  }

  function prepareTexture(tex: THREE.Texture) {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if ("colorSpace" in (tex as any)) (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
    else (tex as any).encoding = (THREE as any).sRGBEncoding;
  }

  function ensureTexture(item: GalleryItem, onReady: (texture: THREE.Texture) => void) {
    if (item.texture) {
      onReady(item.texture);
      return;
    }
    textureLoader.load(
      item.src,
      (tex) => {
        prepareTexture(tex);
        item.texture = tex;
        onReady(tex);
      },
      undefined,
      (err) => console.error("Falha ao carregar textura da galeria:", err)
    );
  }

  function ensureDecalForGalleryItem(item: GalleryItem, makeActive = true) {
    if (decals.has(item.id)) {
      if (makeActive) setActiveDecal(item.id);
      return;
    }
    ensureTexture(item, (texture) => {
      if (!root) return;
      const center = defaultCenter.clone();
      const normal = defaultNormal.clone();
      const width = defaultWidth;
      const height = defaultHeight;
      const depth = defaultDepth;
      const angle = 0;
      const adapter = new MeshDecalAdapter(scene, texture, projectorOptions) as unknown as ProjectorLike;
      adapter.attachTo(root);
      adapter.setTransform(center, normal, width, height, depth, angle);
      const mesh = adapter.getMesh ? adapter.getMesh() : null;
      if (mesh) {
        mesh.userData = mesh.userData || {};
        (mesh.userData as Record<string, unknown>).__decalId = item.id;
      }
      const record: DecalRecord = {
        id: item.id,
        galleryItemId: item.id,
        projector: adapter,
        texture,
        width,
        height,
        depth,
        angle,
        center,
        normal,
        mesh: mesh ?? null,
      };
      decals.set(item.id, record);
      pendingExternalDecals.delete(item.id);
      if (makeActive) setActiveDecal(item.id);
      renderGallery();
    });
  }

  function removeDecalForGalleryItem(id: string) {
    const record = decals.get(id);
    if (!record) return;
    if (record.projector.dispose) record.projector.dispose();
    decals.delete(id);
    if (activeDecalId === id) {
      activeDecalId = null;
      projector = null;
      galleryState.activeId = "";
      selected = false;
      showOverlay(false);
    }
  }

  function upsertExternalDecal(payload: ExternalDecalPayload) {
    const id = payload.id;
    if (!id) return;
    const label = payload.label ?? "Canvas";
    let item = getGalleryItemById(id);
    if (!item) {
      item = { id, label, src: payload.src, hidden: true };
      galleryState.items.push(item);
      galleryState.selectedIds.add(id);
      pendingExternalDecals.add(id);
      renderGallery();
      ensureDecalForGalleryItem(item, false);
      return;
    }

    item.label = label;
    item.src = payload.src;
    item.hidden = true;
    pendingExternalDecals.add(id);
    renderGallery();

    ensureTexture(item, (texture) => {
      const record = decals.get(id);
      if (record) {
        record.texture = texture;
        if (payload.width) record.width = payload.width;
        if (payload.height) record.height = payload.height;
        if (payload.depth) record.depth = payload.depth;
        if (typeof payload.angle === "number") record.angle = payload.angle;
        record.projector.updateTexture?.(texture);
        pendingExternalDecals.delete(id);
      } else {
        if (!root) {
          pendingExternalDecals.add(id);
          return;
        }
        galleryState.selectedIds.add(id);
        ensureDecalForGalleryItem(item!, false);
      }
    });
  }

  function removeExternalDecal(id: string) {
    pendingExternalDecals.delete(id);
    removeDecalForGalleryItem(id);
    const idx = galleryState.items.findIndex((g) => g.id === id);
    if (idx >= 0) {
      galleryState.items.splice(idx, 1);
    }
    galleryState.selectedIds.delete(id);
    if (galleryState.activeId === id) {
      galleryState.activeId = "";
      activeDecalId = null;
      projector = null;
      selected = false;
      showOverlay(false);
    }
    renderGallery();
  }

  function setActiveDecal(id: string | null) {
    if (!id) {
      activeDecalId = null;
      projector = null;
      galleryState.activeId = "";
      selected = false;
      showOverlay(false);
      return;
    }
    const record = decals.get(id);
    activeDecalId = id;
    galleryState.activeId = id;
    if (!record) {
      projector = null;
      selected = false;
      showOverlay(false);
      return;
    }
    projector = record.projector;
    decalWidth = record.width;
    decalHeight = record.height;
    decalDepth = record.depth;
    decalAngle = record.angle;
    decalCenter = record.center;
    decalNormal = record.normal;
    select();
    updateOverlay();
  }

  function syncActiveDecalTransform() {
    if (!activeDecalId) return;
    const record = decals.get(activeDecalId);
    if (!record) return;
    record.width = decalWidth;
    record.height = decalHeight;
    record.depth = decalDepth;
    record.angle = decalAngle;
    record.center.copy(decalCenter);
    record.normal.copy(decalNormal);
    if (record.projector.getMesh) {
      const mesh = record.projector.getMesh();
      record.mesh = mesh ?? record.mesh;
      if (mesh) {
        mesh.userData = mesh.userData || {};
        (mesh.userData as Record<string, unknown>).__decalId = record.id;
      }
    }
  }

  function ensureAllSelectedDecals() {
    if (!root) return;
    decals.forEach((record) => {
      record.projector.attachTo(root!);
      record.projector.setTransform(
        record.center,
        record.normal,
        record.width,
        record.height,
        record.depth,
        record.angle
      );
      if (record.projector.getMesh) {
        const mesh = record.projector.getMesh();
        record.mesh = mesh ?? null;
        if (mesh) {
          mesh.userData = mesh.userData || {};
          (mesh.userData as Record<string, unknown>).__decalId = record.id;
        }
      }
    });
    galleryState.selectedIds.forEach((id) => {
      if (!decals.has(id)) {
        const item = getGalleryItemById(id);
        if (item) ensureDecalForGalleryItem(item, false);
      }
    });
    if (galleryState.activeId) setActiveDecal(galleryState.activeId);
    renderGallery();
  }

  function ensurePendingExternalDecals() {
    if (!root || pendingExternalDecals.size === 0) return;
    const ids = Array.from(pendingExternalDecals);
    ids.forEach((id) => {
      const item = getGalleryItemById(id);
      if (!item) {
        pendingExternalDecals.delete(id);
        return;
      }
      if (decals.has(id)) {
        pendingExternalDecals.delete(id);
        return;
      }
      ensureDecalForGalleryItem(item, false);
    });
  }

  function renderGallery() {
    galleryThumbs.innerHTML = "";
    const visibleItems = galleryState.items.filter((item) => !item.hidden);
    galleryEmptyLabel.style.display = visibleItems.length > 0 ? "none" : "block";
    if (!visibleItems.length) return;

    visibleItems.forEach((item) => {
      const isSelected = galleryState.selectedIds.has(item.id);
      const isActive = galleryState.activeId === item.id && isSelected;

      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        alignItems: "center",
      } as CSSStyleDeclaration);

      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.title = item.label;
      Object.assign(thumb.style, {
        width: "100%",
        aspectRatio: "1",
        borderRadius: "6px",
        padding: "0",
        border: isActive
          ? "2px solid #c4b5fd"
          : isSelected
          ? "2px solid #8b5cf6"
          : "2px solid transparent",
        backgroundColor: "#222",
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        cursor: "pointer",
        boxShadow: isActive
          ? "0 0 0 1px rgba(196,181,253,0.5)"
          : "0 0 0 1px rgba(255,255,255,0.12)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        opacity: isSelected ? "1" : "0.65",
      } as CSSStyleDeclaration);
      thumb.style.backgroundImage = `url(${item.src})`;
      thumb.onmouseenter = () => {
        thumb.style.transform = "translateY(-1px)";
      };
      thumb.onmouseleave = () => {
        thumb.style.transform = "none";
      };
      thumb.addEventListener("click", () => handleThumbClick(item.id));
      wrapper.appendChild(thumb);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      Object.assign(removeBtn.style, {
        position: "absolute",
        top: "4px",
        right: "4px",
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        border: "none",
        background: "rgba(24,24,24,0.85)",
        color: "#fff",
        fontSize: "12px",
        lineHeight: "18px",
        textAlign: "center",
        cursor: "pointer",
        display: isSelected ? "block" : "none",
      } as CSSStyleDeclaration);
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        handleRemoveDecal(item.id);
      });
      wrapper.appendChild(removeBtn);

      const label = document.createElement("span");
      label.textContent = item.label;
      Object.assign(label.style, {
        fontSize: "11px",
        textAlign: "center",
        width: "100%",
        color: isSelected ? "#fff" : "rgba(255,255,255,0.65)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      } as CSSStyleDeclaration);
      wrapper.appendChild(label);

      galleryThumbs.appendChild(wrapper);
    });
  }

  // Removido: não adicionar logo padrão automaticamente

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

  // ---------------- Carregar GLTF ----------------
  const params = new URLSearchParams(window.location.search);
  const modelFile = params.get("model") || "tshirt_model/scene.gltf";
  // Modo mesh (DecalGeometry) é o único disponível
  const depthMultiplier = 1.0;
  const modelUrl = `/models/${modelFile}`;
  const loader = new GLTFLoader();

  // ---- decal: estado e dimensões ----
  let decalWidth = 0.3;
  let decalHeight = 0.3;
  let decalDepth = Math.max(decalWidth, decalHeight) * depthMultiplier;
  let decalAngle = 0;
  let decalCenter = new THREE.Vector3();
  let decalNormal = new THREE.Vector3(0, 0, 1);

  // ---- seleção do gizmo ----
  let selected = false;        // seleciona ao criar
  let isInteracting = false;   // evita auto-deselect durante interações

  // ---- raycast na malha ----
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

  function pickDecalAt(clientX: number, clientY: number): DecalRecord | null {
    if (!decals.size) return null;
    const meshes: THREE.Object3D[] = [];
    decals.forEach((record) => {
      if (record.mesh) meshes.push(record.mesh);
    });
    if (!meshes.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    decalRaycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = decalRaycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !(obj.userData && obj.userData.__decalId) && obj.parent) {
      obj = obj.parent;
    }
    const decalId = obj && obj.userData ? (obj.userData.__decalId as string | undefined) : undefined;
    if (!decalId) return null;
    return decals.get(decalId) ?? null;
  }

  // ---- overlay SVG (gizmo) ----
  const svgNS = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(svgNS, "svg");
  overlay.setAttribute("xmlns", svgNS);
  Object.assign(overlay.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  } as CSSStyleDeclaration);
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
  boxPoly.style.pointerEvents = "auto"; // permitir mover clicando no retângulo
  boxPoly.style.cursor = "move";
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

  // manter os 4 vértices em tela para clique & visibilidade
  let lastScreenQuad: THREE.Vector2[] = []; // TL, TR, BR, BL

  // Basis de gizmo: alinhado à câmera (sempre “em pé”)
  function cameraBillboardBasis() {
    const up = new THREE.Vector3();
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward); // para frente
    up.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
    right.copy(up).cross(forward).normalize();
    // up recalc para garantir ortonormal
    up.copy(forward).cross(right).normalize();
    return { right, up };
  }

  function updateOverlay() {
    if (!projector || !selected) { showOverlay(false); return; }

    const center = decalCenter.clone();

    // <<< gizmo alinhado à câmera, NÃO gira com a logo
    const { right, up } = cameraBillboardBasis();

    const hx = decalWidth * 0.5;
    const hy = decalHeight * 0.5;

    const pTL = center.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(hy));
    const pTR = center.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(hy));
    const pBR = center.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(-hy));
    const pBL = center.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(-hy));

    const sTL = toScreen(pTL), sTR = toScreen(pTR),
      sBR = toScreen(pBR), sBL = toScreen(pBL);

    // Guarda extra: evita atributos NaN no SVG caso a projeção ainda não esteja pronta
    const valid = [sTL, sTR, sBR, sBL].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
    if (!valid) { showOverlay(false); return; }

    lastScreenQuad = [sTL, sTR, sBR, sBL];

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

    // handle de rotação 24px “para fora” do topo (usa up da câmera)
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

  // ponto em polígono convexo (quad) 2D
  function pointInQuad(screenX: number, screenY: number) {
    if (lastScreenQuad.length < 4) return false;
    const p = new THREE.Vector2(screenX, screenY);
    const quad = lastScreenQuad;
    function sign(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) {
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }
    const s1 = sign(quad[0], quad[1], p);
    const s2 = sign(quad[1], quad[2], p);
    const s3 = sign(quad[2], quad[3], p);
    const s4 = sign(quad[3], quad[0], p);
    const hasNeg = (s1 < 0) || (s2 < 0) || (s3 < 0) || (s4 < 0);
    const hasPos = (s1 > 0) || (s2 > 0) || (s3 > 0) || (s4 > 0);
    return !(hasNeg && hasPos);
  }

  // ponto do mundo dentro do retângulo/profundidade do decal
  function isPointInsideDecalWorld(worldPoint: THREE.Vector3): boolean {
    if (!projector) return false;
    // usa a base do decal (não confundir com billboard do gizmo)
    const upCand =
      Math.abs(decalNormal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right0 = upCand.clone().cross(decalNormal).normalize();
    const up0 = decalNormal.clone().cross(right0).normalize();
    const c = Math.cos(decalAngle), s = Math.sin(decalAngle);
    const right = right0.clone().multiplyScalar(c).add(up0.clone().multiplyScalar(s)).normalize();
    const up = up0.clone().multiplyScalar(c).sub(right0.clone().multiplyScalar(s)).normalize();

    const rel = worldPoint.clone().sub(decalCenter);
    const x = rel.dot(right);
    const y = rel.dot(up);
    const z = rel.dot(decalNormal);
    const hx = decalWidth * 0.5;
    const hy = decalHeight * 0.5;
  const hz = (decalDepth ?? Math.max(decalWidth, decalHeight) * depthMultiplier) * 0.5;
    const insideRect  = Math.abs(x) <= hx && Math.abs(y) <= hy;
    const insideDepth = Math.abs(z) <= hz;
    return insideRect && insideDepth;
  }

  function deselect() {
    selected = false;
    showOverlay(false);
  }
  function select() {
    selected = true;
    updateOverlay();
  }

  // ---- arrasto pela malha (mover decal) — canvas, clicando dentro do gizmo
  let draggingMesh = false;
  function attachDragHandlers() {
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (ev) => {
      if (!selected || !projector) return;
      const r = renderer.domElement.getBoundingClientRect();
      const sx = ev.clientX - r.left;
      const sy = ev.clientY - r.top;
      if (!pointInQuad(sx, sy)) return; // só move se clicou dentro do retângulo

      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return;
      draggingMesh = true;
      isInteracting = true;
      decalCenter.copy(h.point);
      decalNormal.copy(h.normal);
      projector.setTransform(
        decalCenter, decalNormal,
        decalWidth, decalHeight, decalDepth, decalAngle
      );
      syncActiveDecalTransform();
      controls.enabled = false;
      updateOverlay();
    });
    el.addEventListener("pointermove", (ev) => {
      if (!draggingMesh || !projector) return;
      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return; // sem hit -> ignora (não sai do objeto)
      decalCenter.copy(h.point);
      decalNormal.copy(h.normal);
      projector.setTransform(
        decalCenter, decalNormal,
        decalWidth, decalHeight, decalDepth, decalAngle
      );
      syncActiveDecalTransform();
      updateOverlay();
    });
    el.addEventListener("pointerup", () => {
      draggingMesh = false;
      isInteracting = false;
      controls.enabled = true;
    });
    el.addEventListener("pointerleave", () => {
      draggingMesh = false;
      isInteracting = false;
      controls.enabled = true;
    });
  }

  // ---- interações do GIZMO (resize/rotate/move no overlay) ----
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
    if (!projector || !selected) return;
    isInteracting = true;
    dragMode = mode;
    startCenter.copy(decalCenter);
    startW = decalWidth; startH = decalHeight; startA = decalAngle;

    // para scale/rotate, manter uma referência de plano; para move usaremos raycast
    dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(decalNormal, decalCenter);
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }
  function endDrag(ev: PointerEvent) {
    dragMode = null;
    dragPlane = null;
    isInteracting = false;
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
    if (!projector || !dragMode || !selected) return;
    ev.preventDefault();

    if (dragMode === "move") {
      // <<< mover SEMPRE por raycast na malha: cola na superfície e segue a curvatura
      const h = hitAt(ev.clientX, ev.clientY);
      if (!h) return; // sem hit -> ignora, não sai do objeto
      decalCenter.copy(h.point);
      decalNormal.copy(h.normal);
    } else {
      // scale/rotate usando plano do decal como referência
      if (!dragPlane) return;
      const p = planeHit(ev.clientX, ev.clientY, dragPlane);
      if (!p) return;

      // base do decal (não do gizmo)
      const upCand =
        Math.abs(startCenter.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right0 = upCand.clone().cross(decalNormal).normalize();
      const up0 = decalNormal.clone().cross(right0).normalize();
      const c = Math.cos(startA), s = Math.sin(startA);
      const right = right0.clone().multiplyScalar(c).add(up0.clone().multiplyScalar(s)).normalize();
      const up = up0.clone().multiplyScalar(c).sub(right0.clone().multiplyScalar(s)).normalize();

      const rel = p.clone().sub(startCenter);
      const x = rel.dot(right), y = rel.dot(up);

      if (dragMode.startsWith("scale-")) {
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
  decalDepth = Math.max(decalWidth, decalHeight) * depthMultiplier;
      } else if (dragMode === "rotate") {
        decalAngle = Math.atan2(y, x);
      }
    }

    projector.setTransform(
      decalCenter, decalNormal,
      decalWidth, decalHeight, decalDepth, decalAngle
    );
    syncActiveDecalTransform();
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

  // mover pelo overlay (clicando no retângulo)
  boxPoly.addEventListener("pointerdown", (ev) => startDrag("move", ev));

  // =========================
  // Clique x Arrasto no canvas (para NÃO deselecionar durante rotação da cena)
  // =========================
  const CLICK_EPS = 5; // px
  let downState: {
    active: boolean;
    startX: number; startY: number;
    moved: boolean;
    wasOutsideGizmo: boolean;
  } = { active: false, startX: 0, startY: 0, moved: false, wasOutsideGizmo: true };

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    const sx = ev.clientX - r.left;
    const sy = ev.clientY - r.top;

    const pickedDecal = pickDecalAt(ev.clientX, ev.clientY);
    if (pickedDecal) {
      if (!galleryState.selectedIds.has(pickedDecal.id)) {
        galleryState.selectedIds.add(pickedDecal.id);
      }
      setActiveDecal(pickedDecal.id);
      renderGallery();
    }

    let outside = selected ? !pointInQuad(sx, sy) : true;
    if (pickedDecal) outside = false;

    downState = {
      active: true,
      startX: sx, startY: sy,
      moved: false,
      wasOutsideGizmo: outside,
    };

    if (!selected) {
      const hit = hitAt(ev.clientX, ev.clientY);
      if (hit && isPointInsideDecalWorld(hit.point)) {
        select();
        updateOverlay();
        downState.wasOutsideGizmo = false; // evita piscar
      }
    }
  }, { capture: true });

  renderer.domElement.addEventListener("pointermove", (ev) => {
    if (!downState.active) return;
    const r = renderer.domElement.getBoundingClientRect();
    const dx = ev.clientX - r.left - downState.startX;
    const dy = ev.clientY - r.top - downState.startY;
    if (!downState.moved && (dx*dx + dy*dy) > CLICK_EPS*CLICK_EPS) {
      downState.moved = true;
    }
  }, { capture: true });

  renderer.domElement.addEventListener("pointerup", () => {
    if (downState.active && !downState.moved && selected && downState.wasOutsideGizmo) {
      deselect();
    }
    downState.active = false;
  }, { capture: true });

  function configureDecalPlacement(targetRoot: THREE.Object3D) {
    const bbox = new THREE.Box3().setFromObject(targetRoot);
    if (bbox.isEmpty()) {
      defaultWidth = 0.3;
      defaultHeight = 0.3;
      defaultDepth = Math.max(defaultWidth, defaultHeight) * depthMultiplier;
      defaultCenter.set(0, 0.5, 0.1);
      defaultNormal.set(0, 0, 1);
      ensureAllSelectedDecals();
      return;
    }

    const size = bbox.getSize(new THREE.Vector3());
    const base = Math.max(size.x, size.y, size.z) || 1.0;
    defaultWidth = base * 0.25;
    defaultHeight = defaultWidth;
    defaultDepth = Math.max(defaultWidth, defaultHeight) * depthMultiplier;

    const center = bbox.getCenter(new THREE.Vector3());
    defaultCenter.set(center.x, center.y, bbox.max.z + 0.02);
    defaultNormal.set(0, 0, 1);

    ensureAllSelectedDecals();
    ensurePendingExternalDecals();
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

  configureDecalPlacement(root);
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

  // verificação de visibilidade p/ deselecionar automaticamente
  function isDecalVisible(): boolean {
    if (!projector) return false;

    // 1) face para a câmera?
    const viewDir = camera.position.clone().sub(decalCenter).normalize(); // do decal p/ câmera
    const facing = decalNormal.dot(viewDir) > 0; // normal voltada para a câmera
    if (!facing) return false;

    // 2) algum vértice do quad dentro do frustum?
    const frustum = new THREE.Frustum();
    const projView = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projView);

    const upCand =
      Math.abs(decalNormal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right0 = upCand.clone().cross(decalNormal).normalize();
    const up0 = decalNormal.clone().cross(right0).normalize();
    const c = Math.cos(decalAngle), s = Math.sin(decalAngle);
    const right = right0.clone().multiplyScalar(c).add(up0.clone().multiplyScalar(s)).normalize();
    const up = up0.clone().multiplyScalar(c).sub(right0.clone().multiplyScalar(s)).normalize();

    const hx = decalWidth * 0.5, hy = decalHeight * 0.5;
    const corners = [
      decalCenter.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(hy)), // TL
      decalCenter.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(hy)),  // TR
      decalCenter.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(-hy)), // BR
      decalCenter.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(-hy)) // BL
    ];
    return corners.some(pt => frustum.containsPoint(pt));
  }

  // ---------------- Loop ----------------
  const tick = () => {
    controls.update();
    if (projector) projector.update();

    // auto-deseleção quando a logo não está visível (mas NÃO durante interação)
    if (selected && !isInteracting && !isDecalVisible()) {
      deselect();
    }

    if (selected) updateOverlay();

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  return {
    upsertExternalDecal,
    removeExternalDecal,
  } satisfies DecalDemoHandle;
}

export default initDecalDemo;
