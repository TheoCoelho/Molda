import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ZoneBehavior = "block" | "constrain";

type SphereZoneDraft = {
  kind?: "sphere";
  name: string;
  center: [number, number, number];
  /** Normal da superfície no ponto marcado (bloqueio apenas na superfície). */
  normal?: [number, number, number];
  radius: number;
  behavior: ZoneBehavior;
  maxDecalSize?: number;
};

type StrokeZoneDraft = {
  kind: "stroke";
  name: string;
  points: [number, number, number][];
  /** Normal por ponto (opcional). Mantém o desenho aderido à superfície ao reabrir. */
  normals?: [number, number, number][];
  width: number;
  behavior: ZoneBehavior;
  maxDecalSize?: number;
};

export type DecalZoneDraft = SphereZoneDraft | StrokeZoneDraft;

type Props = {
  modelPath?: string | null;
  localModelFile?: FileList | null;
  zones: DecalZoneDraft[];
  onChange: (zones: DecalZoneDraft[]) => void;
};

function normalizeModelUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) return path;
  if (path.startsWith("/")) return path;
  return `/models/${path}`;
}

function ModelMesh({ src }: { src: string }) {
  const { scene: rawScene } = useGLTF(src);
  const scene = useMemo(() => rawScene.clone(true), [rawScene]);

  useMemo(() => {
    const bbox = new THREE.Box3().setFromObject(scene);
    if (bbox.isEmpty()) return;
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const target = 6.0;
    if (maxDim > target && maxDim > 0) {
      const scale = target / maxDim;
      scene.scale.multiplyScalar(scale);
    }

    // Mesmo alinhamento usado no decal-engine: centraliza XZ e encosta no grid em Y.
    const boxAfterScale = new THREE.Box3().setFromObject(scene);
    if (!boxAfterScale.isEmpty()) {
      const center = boxAfterScale.getCenter(new THREE.Vector3());
      scene.position.x -= center.x;
      scene.position.z -= center.z;
      const yMin = boxAfterScale.min.y - center.y;
      scene.position.y -= yMin;
    }
  }, [scene]);

  useMemo(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as any).isMesh) return;
      if (!mesh.material) return;
      const original = mesh.material as THREE.Material;
      const next = original.clone() as THREE.MeshStandardMaterial;
      next.color = new THREE.Color("#d5dbe4");
      next.metalness = 0.05;
      next.roughness = 0.88;
      mesh.material = next;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [scene]);

  return <primitive object={scene} />;
}

function BrushStamp({
  point,
  normal,
  radius,
  color,
}: {
  point: [number, number, number];
  normal?: [number, number, number];
  radius: number;
  color: string;
}) {
  const up = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const n = useMemo(() => {
    const arr = normal && normal.length === 3 ? normal : [0, 0, 1];
    const v = new THREE.Vector3(arr[0], arr[1], arr[2]);
    if (v.lengthSq() < 1e-8) return new THREE.Vector3(0, 0, 1);
    return v.normalize();
  }, [normal]);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(up, n), [up, n]);
  const pos = useMemo(() => {
    const p = new THREE.Vector3(point[0], point[1], point[2]);
    return p.add(n.clone().multiplyScalar(0.0015));
  }, [point, n]);

  return (
    <mesh position={pos} quaternion={quat}>
      <circleGeometry args={[radius, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

function PaintStrokeMesh({ zone }: { zone: DecalZoneDraft }) {
  const color = zone.behavior === "block" ? "#ef4444" : "#2563eb";

  if (zone.kind !== "stroke") {
    return <BrushStamp point={zone.center} normal={zone.normal} radius={zone.radius} color={color} />;
  }

  const pts = zone.points;
  if (!pts.length) return null;
  const radius = Math.max(0.01, zone.width * 0.5);
  const normals = zone.normals ?? [];

  return (
    <group>
      {pts.map((p, i) => (
        <BrushStamp key={`${zone.name}-stamp-${i}`} point={p} normal={normals[i]} radius={radius} color={color} />
      ))}
    </group>
  );
}

export default function DecalZoneEditor({ modelPath, localModelFile, zones, onChange }: Props) {
  const [brushEnabled, setBrushEnabled] = useState(false);
  const [brushShape, setBrushShape] = useState<"stroke" | "sphere">("sphere");
  const [brushBehavior, setBrushBehavior] = useState<ZoneBehavior>("block");
  const [brushWidth, setBrushWidth] = useState(0.2);
  const [sphereDiameter, setSphereDiameter] = useState(0.2);
  const [brushMaxDecalSize, setBrushMaxDecalSize] = useState(0.18);
  const [brushAction, setBrushAction] = useState<"paint" | "erase">("paint");
  const [isPainting, setIsPainting] = useState(false);
  const lastPaintPointRef = useRef<THREE.Vector3 | null>(null);
  const activeStrokeNameRef = useRef<string | null>(null);
  const zonesRef = useRef<DecalZoneDraft[]>(zones);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string>("");

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    if (!localModelFile || localModelFile.length === 0) {
      setBlobPreviewUrl("");
      return;
    }

    const glb = Array.from(localModelFile).find((f) => f.name.toLowerCase().endsWith(".glb"));
    if (!glb) {
      setBlobPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(glb);
    setBlobPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localModelFile]);

  const resolvedUrl = useMemo(() => {
    if (blobPreviewUrl) return blobPreviewUrl;
    return normalizeModelUrl(modelPath);
  }, [blobPreviewUrl, modelPath]);

  const canPreview = !!resolvedUrl;

  const commitZones = (next: DecalZoneDraft[]) => {
    zonesRef.current = next;
    onChange(next);
  };

  const paintStampAt = (point: THREE.Vector3) => {
    const current = zonesRef.current;
    const activeDiameter = brushShape === "sphere" ? sphereDiameter : brushWidth;
    const radius = Math.max(0.01, activeDiameter * 0.5);

    if (brushAction === "erase") {
      const remaining = current.filter((zone) => {
        if (zone.kind === "stroke") {
          const eraseRange = Math.max(radius, zone.width * 0.5);
          return !zone.points.some((p) => {
            const dx = p[0] - point.x;
            const dy = p[1] - point.y;
            const dz = p[2] - point.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz) <= eraseRange;
          });
        }
        const dx = zone.center[0] - point.x;
        const dy = zone.center[1] - point.y;
        const dz = zone.center[2] - point.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist > radius + zone.radius;
      });
      commitZones(remaining);
      return;
    }

    const roundedPoint: [number, number, number] = [
      Number(point.x.toFixed(4)),
      Number(point.y.toFixed(4)),
      Number(point.z.toFixed(4)),
    ];
    const roundedNormal: [number, number, number] | undefined =
      (point as any).__brushNormal && Array.isArray((point as any).__brushNormal)
        ? [
            Number((point as any).__brushNormal[0]),
            Number((point as any).__brushNormal[1]),
            Number((point as any).__brushNormal[2]),
          ]
        : undefined;

    if (brushShape === "sphere") {
      const name = `sphere-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newSphere: SphereZoneDraft = {
        kind: "sphere",
        name,
        center: roundedPoint,
        normal: roundedNormal,
        radius: Number(radius.toFixed(4)),
        behavior: brushBehavior,
        maxDecalSize: brushBehavior === "constrain" ? Number(brushMaxDecalSize.toFixed(4)) : undefined,
      };
      commitZones([...current, newSphere]);
      return;
    }

    const strokeName = activeStrokeNameRef.current;
    if (strokeName) {
      const idx = current.findIndex((z) => z.kind === "stroke" && z.name === strokeName);
      if (idx >= 0) {
        const stroke = current[idx] as StrokeZoneDraft;
        const nextStroke: StrokeZoneDraft = {
          ...stroke,
          width: Number(brushWidth.toFixed(4)),
          behavior: brushBehavior,
          maxDecalSize: brushBehavior === "constrain" ? Number(brushMaxDecalSize.toFixed(4)) : undefined,
          points: [...stroke.points, roundedPoint],
          normals: [...(stroke.normals ?? []), ...(roundedNormal ? [roundedNormal] : [])],
        };
        const nextZones = [...current];
        nextZones[idx] = nextStroke;
        commitZones(nextZones);
        return;
      }
    }

    const name = `stroke-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    activeStrokeNameRef.current = name;
    const newStroke: StrokeZoneDraft = {
      kind: "stroke",
      name,
      points: [roundedPoint],
      normals: roundedNormal ? [roundedNormal] : undefined,
      width: Number(brushWidth.toFixed(4)),
      behavior: brushBehavior,
      maxDecalSize: brushBehavior === "constrain" ? Number(brushMaxDecalSize.toFixed(4)) : undefined,
    };
    commitZones([...current, newStroke]);
  };

  const clearZones = () => {
    commitZones([]);
    lastPaintPointRef.current = null;
    activeStrokeNameRef.current = null;
  };

  const shouldStamp = (point: THREE.Vector3) => {
    const last = lastPaintPointRef.current;
    if (!last) return true;
    const spacing = brushShape === "sphere"
      ? Math.max(0.005, sphereDiameter * 0.65)
      : Math.max(0.005, brushWidth * 0.35);
    return last.distanceTo(point) >= spacing;
  };

  const handleBrushPointerDown = (event: any) => {
    if (!brushEnabled) return;
    event.stopPropagation();
    setIsPainting(true);
    activeStrokeNameRef.current = null;
    const p = event.point.clone() as THREE.Vector3;
    if (event?.face?.normal && event?.object) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld);
      const n = event.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      (p as any).__brushNormal = [Number(n.x.toFixed(4)), Number(n.y.toFixed(4)), Number(n.z.toFixed(4))];
    }
    paintStampAt(p);
    lastPaintPointRef.current = p;
  };

  const handleBrushPointerMove = (event: any) => {
    if (!brushEnabled || !isPainting) return;
    event.stopPropagation();
    const p = event.point.clone() as THREE.Vector3;
    if (event?.face?.normal && event?.object) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld);
      const n = event.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      (p as any).__brushNormal = [Number(n.x.toFixed(4)), Number(n.y.toFixed(4)), Number(n.z.toFixed(4))];
    }
    if (!shouldStamp(p)) return;
    paintStampAt(p);
    lastPaintPointRef.current = p;
  };

  const stopPainting = () => {
    setIsPainting(false);
    lastPaintPointRef.current = null;
    activeStrokeNameRef.current = null;
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Pincel de bloqueio/limitação de decal</h4>
          <p className="text-xs text-muted-foreground">
            Pinte diretamente no modelo 3D. Toda área pintada passa a bloquear decal ou limitar tamanho.
          </p>
        </div>
        <div className="text-xs rounded-full border px-2 py-1">{zones.length} zona(s)</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <Button type="button" variant={brushEnabled ? "default" : "outline"} onClick={() => setBrushEnabled((v) => !v)}>
          {brushEnabled ? "Pincel: ON" : "Pincel: OFF"}
        </Button>

        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brushAction}
          onChange={(e) => setBrushAction(e.target.value as "paint" | "erase")}
        >
          <option value="paint">Ação: pintar</option>
          <option value="erase">Ação: apagar</option>
        </select>

        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brushBehavior}
          onChange={(e) => setBrushBehavior(e.target.value as ZoneBehavior)}
          disabled={brushAction === "erase"}
        >
          <option value="block">Pintura: bloquear</option>
          <option value="constrain">Pintura: limitar tamanho</option>
        </select>

        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brushShape}
          onChange={(e) => setBrushShape(e.target.value as "stroke" | "sphere")}
          disabled={brushAction === "erase"}
        >
          <option value="sphere">Forma: esfera</option>
          <option value="stroke">Forma: traço</option>
        </select>

        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={brushWidth}
          onChange={(e) => setBrushWidth(Math.max(0.01, Number(e.target.value) || 0.2))}
          placeholder="Largura (traço)"
          disabled={brushShape !== "stroke"}
        />

        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={sphereDiameter}
          onChange={(e) => setSphereDiameter(Math.max(0.01, Number(e.target.value) || 0.2))}
          placeholder="Diâmetro (esfera)"
          disabled={brushShape !== "sphere"}
        />

        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={brushMaxDecalSize}
          onChange={(e) => setBrushMaxDecalSize(Math.max(0.01, Number(e.target.value) || 0.18))}
          placeholder="Max decal (constrain)"
          disabled={brushBehavior !== "constrain" || brushAction === "erase"}
        />
      </div>

      <div className="h-[320px] rounded-lg overflow-hidden border bg-slate-100">
        {!canPreview ? (
          <div className="h-full grid place-items-center text-xs text-muted-foreground px-4 text-center">
            Selecione um modelo 3D para habilitar o editor. Preview local durante upload funciona com arquivo .glb.
          </div>
        ) : (
          <Canvas camera={{ position: [0, 1.3, 3.4], fov: 46 }} onPointerUp={stopPainting} onPointerMissed={stopPainting}>
            <color attach="background" args={["#f1f5f9"]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[4, 4, 4]} intensity={1.0} />
            <Suspense fallback={<Html center>Carregando modelo...</Html>}>
              <Bounds fit clip observe margin={1.15}>
                <group
                  onPointerDown={handleBrushPointerDown}
                  onPointerMove={handleBrushPointerMove}
                  onPointerUp={stopPainting}
                >
                  <ModelMesh src={resolvedUrl} />
                </group>
              </Bounds>
            </Suspense>

            {zones.map((zone, idx) => {
              return (
                <group key={`${zone.name}-${idx}`}>
                  <PaintStrokeMesh zone={zone} />
                </group>
              );
            })}

            <OrbitControls enabled={!brushEnabled} enablePan={false} minDistance={1.3} maxDistance={8} />
          </Canvas>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={clearZones} disabled={zones.length === 0}>
          Limpar zonas
        </Button>
        <p className="text-xs text-muted-foreground">
          Segure e arraste o mouse para pintar. Enquanto o pincel estiver ON, a rotação da peça fica travada.
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <Label className="text-xs text-muted-foreground">JSON gerado da pintura (somente leitura)</Label>
        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-950 p-2 text-[10px] text-slate-100">
          {JSON.stringify(zones, null, 2)}
        </pre>
      </div>
    </div>
  );
}
