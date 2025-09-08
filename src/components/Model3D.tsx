// src/components/Model3D.tsx
import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Html, useGLTF, Bounds, Center } from "@react-three/drei";
import * as THREE from "three";

type Vec3 = [number, number, number];

export type Model3DProps = {
  src?: string;               
  baseColor?: string;           
  camera?: { position?: Vec3; fov?: number };
  controls?: { maxDistance?: number; minDistance?: number; enableZoom?: boolean; enablePan?: boolean };
  scale?: number | Vec3;        // escala adicional (além do auto-fit)
  rotation?: Vec3;              // rotação do modelo
  position?: Vec3;              // posição do modelo
  envPreset?: React.ComponentProps<typeof Environment>["preset"];
  showControlsButton?: boolean; // play/pause rotação
  autoRotate?: boolean;
  className?: string;
};

function GLTFModel({
  src,
  baseColor,
  scale = 1,
  rotation = [0, 0, 0],
  position = [0, 0, 0],
}: Required<Pick<Model3DProps, "src" | "baseColor" | "scale" | "rotation" | "position">>) {
  const { scene: raw } = useGLTF(src);

  // Clonamos para poder ajustar sem afetar cache global
  const scene = useMemo(() => raw.clone(true), [raw]);

  // 1) Ajuste de cor base quando possível
  useMemo(() => {
    if (!baseColor) return;
    const target = new THREE.Color(baseColor);
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as any).isMesh) {
        const material = mesh.material as THREE.Material & { color?: THREE.Color };
        if (material && "color" in material && material.color) {
          material.color.set(target);
          (material as any).needsUpdate = true;
        }
      }
    });
  }, [scene, baseColor]);

  // 2) Centraliza no (0,0,0) e calcula um fator de escala para caber na tela
  const { center, fitScale } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    const s = new THREE.Vector3();
    box.getCenter(c);
    box.getSize(s);
    const maxDim = Math.max(s.x, s.y, s.z) || 1;
    const desired = 3; // tamanho alvo no mundo (ajuste se quiser maior/menor)
    const factor = desired / maxDim;
    return { center: c, fitScale: factor };
  }, [scene]);

  // 3) Compõe escala final (auto-fit * escala passada por prop)
  const finalScale: Vec3 = useMemo(() => {
    if (typeof scale === "number") return [fitScale * scale, fitScale * scale, fitScale * scale];
    return [fitScale * scale[0], fitScale * scale[1], fitScale * scale[2]];
  }, [fitScale, scale]);

  // Observação:
  // - Aplicamos 'position' no group (que corrige o centro),
  // - E aplicamos 'rotation' no primitive (modelo).
  return (
    <group position={[position[0] - center.x, position[1] - center.y, position[2] - center.z]}>
      <primitive object={scene} rotation={rotation as any} scale={finalScale as any} />
    </group>
  );
}

function PlaceholderShirt({ color = "#cccccc" }: { color?: string }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color }), [color]);
  return (
    <group>
      <mesh position={[0, 1, 0]} material={material}>
        <boxGeometry args={[2, 2.2, 1]} />
      </mesh>
      <mesh position={[0, 2.4, 0]} material={material}>
        <cylinderGeometry args={[0.35, 0.35, 0.4, 24]} />
      </mesh>
      <mesh position={[1.4, 1.1, 0]} rotation={[0, 0, Math.PI / 10]} material={material}>
        <boxGeometry args={[1.2, 0.6, 1]} />
      </mesh>
      <mesh position={[-1.4, 1.1, 0]} rotation={[0, 0, -Math.PI / 10]} material={material}>
        <boxGeometry args={[1.2, 0.6, 1]} />
      </mesh>
    </group>
  );
}

export default function Model3D({
  src,
  baseColor = "#ffffff",
  camera,
  controls,
  scale = 1,
  rotation = [0, 0, 0],
  position = [0, 0, 0],
  envPreset = "studio",
  showControlsButton = true,
  autoRotate = true,
  className,
}: Model3DProps) {
  const [rotating, setRotating] = useState<boolean>(autoRotate);

  const camPos: Vec3 = camera?.position ?? [0, 1.2, 6];
  const fov = camera?.fov ?? 45;

  const enableZoom = controls?.enableZoom ?? true;
  const enablePan = controls?.enablePan ?? false;
  const minDistance = controls?.minDistance ?? 2.5;
  const maxDistance = controls?.maxDistance ?? 12;

  return (
    <div className={["relative w-full h-full", className].filter(Boolean).join(" ")}>
      <Canvas
  camera={{ position: camPos, fov, near: 0.01, far: 10000 }}
  style={{ width: "100%", height: "100%" }}
>
  {/* Fundo visível (hex normal, 6 dígitos) */}
  <color attach="background" args={["#f3f4f6"]} />

  {/* Luzes */}
  <ambientLight intensity={0.7} />
  <directionalLight position={[5, 5, 5]} intensity={0.9} />

  {/* Enquadramento automático do modelo */}
  <Suspense fallback={<Html center>Carregando modelo...</Html>}>
    <Bounds fit clip observe margin={1.2}>
      <Center>
        {src ? (
          <GLTFModel
            src={src}
            baseColor={baseColor}
            scale={scale}
            rotation={rotation}
            position={position}
          />
        ) : (
          <PlaceholderShirt color={baseColor} />
        )}
      </Center>
    </Bounds>
  </Suspense>

  <OrbitControls
    enablePan={enablePan}
    enableZoom={enableZoom}
    minDistance={minDistance}
    maxDistance={maxDistance}
    autoRotate={rotating}
    autoRotateSpeed={0.6}
  />
  <Environment preset={envPreset} />
</Canvas>


      {/* Botão play/pause no canto inferior direito */}
      {showControlsButton && (
        <button
          type="button"
          onClick={() => setRotating((v) => !v)}
          aria-label={rotating ? "Pausar rotação" : "Reproduzir rotação"}
          className="absolute bottom-3 right-3 inline-flex items-center justify-center rounded-full border bg-white/90 backdrop-blur px-2.5 py-2 shadow-md hover:bg-white"
          title={rotating ? "Pausar" : "Play"}
        >
          {rotating ? (
            <span className="block h-4 w-4 relative">
              <span className="absolute left-0 top-0 h-4 w-[3px] bg-black/70"></span>
              <span className="absolute right-0 top-0 h-4 w-[3px] bg-black/70"></span>
            </span>
          ) : (
            <span className="block h-0 w-0 border-y-[8px] border-y-transparent border-l-[14px] border-l-black/70"></span>
          )}
        </button>
      )}
    </div>
  );
}

// Preload opcional
useGLTF.preload?.("");
