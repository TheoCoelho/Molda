import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface TShirt3DProps {
  color: string;
}

function TShirtMesh({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  // Criar geometria da camiseta usando extrusão
  const createTShirtShape = () => {
    const shape = new THREE.Shape();
    
    // Desenhar o contorno da camiseta
    shape.moveTo(-1.5, 2);
    shape.lineTo(-1.5, 1.5);
    shape.lineTo(-2.5, 1.5);
    shape.lineTo(-2.5, 0.5);
    shape.lineTo(-1.5, 0.5);
    shape.lineTo(-1.5, -2);
    shape.lineTo(1.5, -2);
    shape.lineTo(1.5, 0.5);
    shape.lineTo(2.5, 0.5);
    shape.lineTo(2.5, 1.5);
    shape.lineTo(1.5, 1.5);
    shape.lineTo(1.5, 2);
    shape.lineTo(-1.5, 2);

    const extrudeSettings = {
      depth: 0.3,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 2,
      bevelSize: 0.1,
      bevelThickness: 0.1,
    };

    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  };

  const geometry = createTShirtShape();

  return (
    <mesh ref={meshRef} geometry={geometry} position={[0, 0, 0]}>
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

export default function TShirt3D({ color }: TShirt3DProps) {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />
        
        <TShirtMesh color={color} />
        
        <OrbitControls 
          enablePan={false}
          enableZoom={true}
          maxDistance={15}
          minDistance={3}
        />
        
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}