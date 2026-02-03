import * as THREE from "three";

/**
 * UVTextureAdapter: aplica uma textura diretamente no material do modelo
 * usando UV mapping existente. Ideal para modelos com formas complexas
 * como torus, knots, etc. onde projeção de decal não funciona bem.
 * 
 * Esta abordagem substitui/modifica o material do modelo para incluir a textura.
 */
export default class UVTextureAdapter {
  private root: THREE.Object3D | null = null;
  private scene: THREE.Scene;
  private texture: THREE.Texture;
  private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();
  private modifiedMeshes: Set<THREE.Mesh> = new Set();
  private dummyMesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, texture: THREE.Texture) {
    this.scene = scene;
    this.texture = texture;
    this.prepareTexture(texture);
  }

  private prepareTexture(tex: THREE.Texture) {
    if ("colorSpace" in tex) {
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
    }
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    
    // Usa ClampToEdge para evitar repetição e manter a imagem única
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    
    // Centraliza a textura e ajusta escala para não esticar
    tex.center.set(0.5, 0.5);
    tex.rotation = 0;
    
    // Escala para manter proporção 1:1 (sem esticar)
    // O repeat controla quantas vezes a textura é repetida
    // Valores menores = textura maior, valores maiores = textura menor
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    
    tex.needsUpdate = true;
  }

  attachTo(root: THREE.Object3D) {
    this.root = root;
  }

  setTransform(
    _position: THREE.Vector3,
    _normal: THREE.Vector3,
    width: number,
    height: number,
    _depth: number,
    _angleRad = 0
  ) {
    if (!this.root) return;

    // Calcula a proporção para manter a textura sem esticar
    const aspectRatio = width / height;
    
    // Ajusta o repeat da textura para manter proporção correta
    if (aspectRatio > 1) {
      // Imagem mais larga que alta
      this.texture.repeat.set(1, aspectRatio);
      this.texture.offset.set(0, (1 - aspectRatio) / 2);
    } else if (aspectRatio < 1) {
      // Imagem mais alta que larga
      this.texture.repeat.set(1 / aspectRatio, 1);
      this.texture.offset.set((1 - 1 / aspectRatio) / 2, 0);
    } else {
      this.texture.repeat.set(1, 1);
      this.texture.offset.set(0, 0);
    }
    this.texture.needsUpdate = true;

    // Aplica a textura em todos os meshes do modelo
    this.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;

      // Salva o material original se ainda não foi salvo
      if (!this.originalMaterials.has(mesh)) {
        this.originalMaterials.set(mesh, mesh.material);
      }

      // Cria um novo material com a textura aplicada
      const newMaterial = new THREE.MeshStandardMaterial({
        map: this.texture,
        transparent: true,
        side: THREE.DoubleSide,
        metalness: 0.0,
        roughness: 0.6,
      });

      mesh.material = newMaterial;
      this.modifiedMeshes.add(mesh);
    });

    // Cria um mesh dummy para manter compatibilidade com a API
    if (!this.dummyMesh) {
      const dummyGeom = new THREE.BufferGeometry();
      const dummyMat = new THREE.MeshBasicMaterial({ visible: false });
      this.dummyMesh = new THREE.Mesh(dummyGeom, dummyMat);
      this.dummyMesh.visible = false;
    }
  }

  update() {
    // Nada a fazer - a textura já está aplicada
  }

  updateTexture(texture: THREE.Texture) {
    this.texture = texture;
    this.prepareTexture(texture);

    // Atualiza a textura em todos os meshes modificados
    for (const mesh of this.modifiedMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat && mat.map !== undefined) {
        mat.map = texture;
        mat.needsUpdate = true;
      }
    }
  }

  getMesh(): THREE.Mesh | null {
    return this.dummyMesh;
  }

  dispose() {
    // Restaura os materiais originais
    for (const [mesh, originalMaterial] of this.originalMaterials) {
      // Dispõe o material modificado
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      // Restaura o original
      mesh.material = originalMaterial;
    }

    this.originalMaterials.clear();
    this.modifiedMeshes.clear();

    if (this.dummyMesh) {
      this.dummyMesh.geometry.dispose();
      if (this.dummyMesh.material instanceof THREE.Material) {
        this.dummyMesh.material.dispose();
      }
      this.dummyMesh = null;
    }

    this.root = null;
  }
}
