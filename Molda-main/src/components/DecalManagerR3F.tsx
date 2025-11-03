import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import MeshDecalAdapter from "../lib/decal/MeshDecalAdapter";

export type DecalManagerR3FProps = {
  targetRef?: React.RefObject<THREE.Object3D | null>;
};

type GalleryItem = {
  id: string;
  url: string;
  texture: THREE.Texture;
  label: string;
};

type DecalRecord = {
  id: string;
  adapter: MeshDecalAdapter;
  mesh: THREE.Mesh | null;
  textureId: string;
  width: number;
  height: number;
  depth: number;
  angle: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
};

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

type HandleType = "tl" | "tr" | "br" | "bl" | "tm" | "bm" | "ml" | "mr" | "rot";

export default function DecalManagerR3F({ targetRef }: DecalManagerR3FProps) {
  const { scene, camera, gl, size } = useThree();
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const decalsRef = useRef<Map<string, DecalRecord>>(new Map());
  const [activeDecalId, setActiveDecalId] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const bboxCache = useRef<{ size: THREE.Vector3 } | null>(null);
  
  const [handles, setHandles] = useState<Record<HandleType, { x: number; y: number }>>({
    tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 },
    tm: { x: 0, y: 0 }, bm: { x: 0, y: 0 }, ml: { x: 0, y: 0 }, mr: { x: 0, y: 0 },
    rot: { x: 0, y: 0 }
  });
  const [boxPoints, setBoxPoints] = useState<string>("");
  const [rotLineCoords, setRotLineCoords] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });
  
  const dragStateRef = useRef<{
    type: HandleType | "move" | null;
    startPointer: THREE.Vector2;
    startWidth: number;
    startHeight: number;
    startCenter: THREE.Vector3;
    startAngle: number;
  } | null>(null);

  const getTargetRoot = useCallback(() => {
    return targetRef?.current ?? scene;
  }, [targetRef, scene]);

  const computeDefaultSize = useCallback(() => {
    if (!bboxCache.current) {
      const root = getTargetRoot();
      const box = new THREE.Box3().setFromObject(root);
      const boxSize = new THREE.Vector3();
      box.getSize(boxSize);
      bboxCache.current = { size: boxSize };
    }
    const boxSize = bboxCache.current!.size;
    const major = Math.max(boxSize.x, boxSize.y, boxSize.z);
    const width = major * 0.35;
    const height = width;
    const depth = width * 0.2;
    return { width, height, depth };
  }, [getTargetRoot]);

  const toScreen = useCallback((worldPos: THREE.Vector3) => {
    const v = worldPos.clone().project(camera);
    return new THREE.Vector2(
      (v.x * 0.5 + 0.5) * size.width,
      (-v.y * 0.5 + 0.5) * size.height
    );
  }, [camera, size]);

  const cameraBillboardBasis = useCallback(() => {
    const up = new THREE.Vector3();
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    up.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
    right.copy(up).cross(forward).normalize();
    up.copy(forward).cross(right).normalize();
    return { right, up };
  }, [camera]);

  const updateOverlay = useCallback(() => {
    if (!activeDecalId) {
      setOverlayVisible(false);
      return;
    }
    const record = decalsRef.current.get(activeDecalId);
    if (!record) {
      setOverlayVisible(false);
      return;
    }

    const center = record.center.clone();
    const { right, up } = cameraBillboardBasis();
    const hx = record.width * 0.5;
    const hy = record.height * 0.5;

    const pTL = center.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(hy));
    const pTR = center.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(hy));
    const pBR = center.clone().add(right.clone().multiplyScalar(hx)).add(up.clone().multiplyScalar(-hy));
    const pBL = center.clone().add(right.clone().multiplyScalar(-hx)).add(up.clone().multiplyScalar(-hy));

    const sTL = toScreen(pTL), sTR = toScreen(pTR), sBR = toScreen(pBR), sBL = toScreen(pBL);
    
    const pts = [sTL, sTR, sBR, sBL, sTL].map((p) => `${p.x},${p.y}`).join(" ");
    setBoxPoints(pts);

    setHandles({
      tl: { x: sTL.x, y: sTL.y },
      tr: { x: sTR.x, y: sTR.y },
      br: { x: sBR.x, y: sBR.y },
      bl: { x: sBL.x, y: sBL.y },
      tm: { x: (sTL.x + sTR.x) / 2, y: (sTL.y + sTR.y) / 2 },
      bm: { x: (sBL.x + sBR.x) / 2, y: (sBL.y + sBR.y) / 2 },
      ml: { x: (sTL.x + sBL.x) / 2, y: (sTL.y + sBL.y) / 2 },
      mr: { x: (sTR.x + sBR.x) / 2, y: (sTR.y + sBR.y) / 2 },
      rot: { x: 0, y: 0 }
    });

    const topMid = new THREE.Vector2((sTL.x + sTR.x) / 2, (sTL.y + sTR.y) / 2);
    const dirUp2D = new THREE.Vector2(sTL.y - sTR.y, sTR.x - sTL.x).normalize();
    const rotHandle = topMid.clone().add(dirUp2D.multiplyScalar(24));
    setRotLineCoords({ x1: topMid.x, y1: topMid.y, x2: rotHandle.x, y2: rotHandle.y });
    setHandles(prev => ({ ...prev, rot: { x: rotHandle.x, y: rotHandle.y } }));

    setOverlayVisible(true);
  }, [activeDecalId, cameraBillboardBasis, toScreen]);

  useFrame(() => {
    if (overlayVisible && activeDecalId) {
      updateOverlay();
    }
  });

  const addGalleryItemFromFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    const loader = new THREE.TextureLoader();
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(url, (tex) => resolve(tex), undefined, (err) => reject(err));
    });
    const id = makeId();
    const label = file.name || `Imagem ${gallery.length + 1}`;
    setGallery((prev) => [...prev, { id, url, texture, label }]);
    return id;
  }, [gallery.length]);

  const createDecal = useCallback((item: GalleryItem, worldPos: THREE.Vector3, worldNormal: THREE.Vector3) => {
    const root = getTargetRoot();
    const { width, height, depth } = computeDefaultSize();
    const adapter = new MeshDecalAdapter(scene, item.texture, {
      frontOnly: true,
      frontHalfOnly: false,
      useFeather: true,
      feather: 0.08,
      zBandFraction: 0.6,
      zBandMin: 0.015,
    });
    adapter.attachTo(root);
    adapter.setTransform(worldPos, worldNormal, width, height, depth, 0);
    adapter.update();
    const mesh = adapter.getMesh();
    const id = makeId();
    if (mesh) {
      mesh.userData.__decalId = id;
    }
    const record: DecalRecord = {
      id,
      adapter,
      mesh: mesh ?? null,
      textureId: item.id,
      width,
      height,
      depth,
      angle: 0,
      center: worldPos.clone(),
      normal: worldNormal.clone(),
    };
    decalsRef.current.set(id, record);
    setSelectedIds(prev => new Set([...prev, id]));
    setActiveDecalId(id);
    updateOverlay();
  }, [computeDefaultSize, getTargetRoot, scene, updateOverlay]);

  const onCanvasPointerDown = useCallback(
    (ev: PointerEvent) => {
      const canvas = gl.domElement as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);

      const root = getTargetRoot();
      
      // Check if clicking existing decal
      const decalMeshes = Array.from(decalsRef.current.values())
        .map((d) => d.mesh)
        .filter((m): m is THREE.Mesh => !!m);
      const hitDecal = decalMeshes.length ? raycaster.intersectObjects(decalMeshes, true)[0] : undefined;
      if (hitDecal && hitDecal.object) {
        const hitId = (hitDecal.object.userData && hitDecal.object.userData.__decalId) || null;
        if (hitId) {
          setActiveDecalId(hitId);
          updateOverlay();
          return;
        }
      }

      // Place new decal
      const intersects = raycaster.intersectObject(root, true);
      if (!intersects.length || gallery.length === 0) return;
      
      const hit = intersects[0];
      const point = hit.point.clone();
      const object = hit.object as THREE.Mesh;
      const faceNormal = hit.face?.normal?.clone() || new THREE.Vector3(0, 0, 1);
      const worldNormal = faceNormal.clone().transformDirection(object.matrixWorld).normalize();

      const lastItem = gallery[gallery.length - 1];
      if (lastItem) {
        createDecal(lastItem, point, worldNormal);
      }
    },
    [camera, createDecal, gallery, getTargetRoot, gl.domElement, pointer, raycaster, updateOverlay]
  );

  useEffect(() => {
    const canvas = gl.domElement as HTMLCanvasElement;
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    return () => canvas.removeEventListener("pointerdown", onCanvasPointerDown);
  }, [gl.domElement, onCanvasPointerDown]);

  const removeActive = useCallback(() => {
    if (!activeDecalId) return;
    const rec = decalsRef.current.get(activeDecalId);
    if (rec) {
      rec.adapter.dispose();
      decalsRef.current.delete(activeDecalId);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(activeDecalId);
        return next;
      });
      setActiveDecalId(null);
      setOverlayVisible(false);
    }
  }, [activeDecalId]);

  const handleThumbClick = useCallback((id: string) => {
    setActiveDecalId(id);
    updateOverlay();
  }, [updateOverlay]);

  return (
    <>
      <Html fullscreen style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: 12, right: 12, pointerEvents: "auto" }}>
          <div style={{ background: "rgba(255,255,255,0.9)", padding: 10, borderRadius: 8, width: 220, boxShadow: "0 4px 14px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>Decals</strong>
              <button
                onClick={removeActive}
                disabled={!activeDecalId}
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd", background: activeDecalId ? "#fee2e2" : "#f3f4f6", cursor: activeDecalId ? "pointer" : "not-allowed" }}
              >
                Remover
              </button>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "inline-block", fontSize: 12, padding: "6px 10px", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 6, cursor: "pointer" }}>
                + Adicionar imagem
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addGalleryItemFromFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {gallery.map((g) => {
                const isActive = g.id === activeDecalId;
                return (
                  <button
                    key={g.id}
                    onClick={() => handleThumbClick(g.id)}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 6,
                      overflow: "hidden",
                      border: isActive ? "2px solid #6366f1" : "1px solid #ddd",
                      padding: 0,
                      background: "#fff",
                      cursor: "pointer",
                    }}
                    title={g.label}
                  >
                    <img src={g.url} alt={g.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                );
              })}
            </div>
            {gallery.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
                Adicione uma imagem para começar
              </div>
            )}
          </div>
        </div>

        {overlayVisible && (
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 999,
            }}
          >
            <polyline
              points={boxPoints}
              fill="none"
              stroke="rgba(99, 102, 241, 0.8)"
              strokeWidth="2"
            />
            <line
              x1={rotLineCoords.x1}
              y1={rotLineCoords.y1}
              x2={rotLineCoords.x2}
              y2={rotLineCoords.y2}
              stroke="rgba(99, 102, 241, 0.6)"
              strokeWidth="1"
            />
            {Object.entries(handles).map(([key, pos]) => (
              <circle
                key={key}
                cx={pos.x}
                cy={pos.y}
                r={key === "rot" ? 5 : 4}
                fill={key === "rot" ? "rgba(147, 51, 234, 0.9)" : "rgba(255, 255, 255, 0.95)"}
                stroke="rgba(99, 102, 241, 0.9)"
                strokeWidth="1.5"
                style={{ pointerEvents: "auto", cursor: key === "rot" ? "grab" : "nwse-resize" }}
              />
            ))}
          </svg>
        )}
      </Html>
    </>
  );
}
