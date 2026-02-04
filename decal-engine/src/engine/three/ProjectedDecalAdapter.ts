import * as THREE from "three";
import ProjectedTextureDecal from "./ProjectedTextureDecal";

/**
 * ProjectedDecalAdapter: adapta ProjectedTextureDecal para a API do MeshDecalAdapter.
 * Projeta a textura inteira sobre o objeto, sem cortar por faces.
 * 
 * OTIMIZAÇÃO DE PERFORMANCE:
 * - Durante arrasto: mostra ghost mesh (plano simples à frente do modelo com opacidade)
 * - Ao finalizar: reconstrói a geometria precisa na superfície
 */
export default class ProjectedDecalAdapter {
  private projected: ProjectedTextureDecal;
  private root: THREE.Object3D | null = null;
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private ray: THREE.Raycaster = new THREE.Raycaster();
  private texture: THREE.Texture;

  // Estado para preview rápido (interface compatível com MeshDecalAdapter)
  private isDragging = false;
  private pendingTransform: {
    position: THREE.Vector3;
    normal: THREE.Vector3;
    width: number;
    height: number;
    depth: number;
    angleRad: number;
  } | null = null;

  // Ghost mesh para preview durante arrasto
  private ghostMesh: THREE.Mesh | null = null;
  private ghostMaterial: THREE.MeshBasicMaterial | null = null;
  private static readonly GHOST_OPACITY = 0.6;
  private static readonly GHOST_OFFSET = 0.03; // Distância à frente da superfície

  constructor(scene: THREE.Scene, texture: THREE.Texture, _opts: any = {}) {
    this.scene = scene;
    this.texture = texture;
    this.projected = new ProjectedTextureDecal(texture, {
      depth: 50, // Profundidade grande para atravessar o objeto
      opacity: 1.0,
      feather: 0.02,
    });
  }

  attachTo(root: THREE.Object3D) {
    this.root = root;
  }

  /**
   * Encontra o mesh mais provável sob o ponto usando raycast
   */
  private pickTargetMesh(point: THREE.Vector3, normal: THREE.Vector3): THREE.Mesh | null {
    if (!this.root) return null;
    const origin = point.clone().add(normal.clone().multiplyScalar(0.02));
    const dir = normal.clone().multiplyScalar(-1).normalize();
    this.ray.set(origin, dir);
    const hit = this.ray.intersectObject(this.root, true)[0];
    const obj = hit?.object ?? null;
    return (obj && (obj as any).isMesh) ? (obj as THREE.Mesh) : null;
  }

  /**
   * Encontra qualquer mesh no root
   */
  private findAnyMesh(): THREE.Mesh | null {
    if (!this.root) return null;
    let found: THREE.Mesh | null = null;
    this.root.traverse((node) => {
      if (!found && (node as THREE.Mesh).isMesh) {
        found = node as THREE.Mesh;
      }
    });
    return found;
  }

  /**
   * Cria ou atualiza a ghost mesh (plano simples com textura) para preview durante arrasto
   */
  private createOrUpdateGhostMesh(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    angleRad: number
  ) {
    // Cria o material se não existir
    if (!this.ghostMaterial) {
      this.ghostMaterial = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: ProjectedDecalAdapter.GHOST_OPACITY,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
    }

    // Cria a geometria se não existir
    if (!this.ghostMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      this.ghostMesh = new THREE.Mesh(geometry, this.ghostMaterial);
      this.ghostMesh.renderOrder = 999; // Renderiza por último para ficar à frente
      this.scene.add(this.ghostMesh);
    }

    // Posiciona a ghost mesh um pouco à frente da superfície
    const offsetPosition = position.clone().add(
      normal.clone().multiplyScalar(ProjectedDecalAdapter.GHOST_OFFSET)
    );
    this.ghostMesh.position.copy(offsetPosition);

    // Escala para o tamanho do decal
    this.ghostMesh.scale.set(width, height, 1);

    // Orienta a mesh para ficar perpendicular à normal
    // Usa a mesma lógica do gizmo: alinha com a normal e aplica rotação 2D
    const normalDir = normal.clone().normalize();
    
    // Calcula um vetor "up" que não seja paralelo à normal
    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normalDir.dot(up)) > 0.99) {
      up = new THREE.Vector3(1, 0, 0);
    }
    
    // Calcula os vetores tangentes (right e realUp) perpendiculares à normal
    const right = new THREE.Vector3().crossVectors(up, normalDir).normalize();
    const realUp = new THREE.Vector3().crossVectors(normalDir, right).normalize();
    
    // Cria matriz de rotação base a partir dos vetores tangentes
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(right, realUp, normalDir);
    
    // Aplica a rotação 2D (angleRad) em torno da normal
    const angleMatrix = new THREE.Matrix4().makeRotationAxis(normalDir, angleRad);
    rotationMatrix.premultiply(angleMatrix);
    
    this.ghostMesh.quaternion.setFromRotationMatrix(rotationMatrix);
  }

  /**
   * Remove a ghost mesh
   */
  private removeGhostMesh() {
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh.geometry.dispose();
      this.ghostMesh = null;
    }
    if (this.ghostMaterial) {
      this.ghostMaterial.dispose();
      this.ghostMaterial = null;
    }
  }

  /**
   * Indica se está em modo de arrasto (para preview rápido)
   */
  setDragging(dragging: boolean) {
    const wasDragging = this.isDragging;
    this.isDragging = dragging;

    if (dragging && !wasDragging) {
      // Início do arrasto: esconde a mesh real
      if (this.mesh) {
        this.mesh.visible = false;
      }
    }

    // Quando para de arrastar, faz commit da posição final
    if (wasDragging && !dragging) {
      this.removeGhostMesh();
      if (this.mesh) {
        this.mesh.visible = true;
      }
      if (this.pendingTransform) {
        this.commitTransform();
      }
    }
  }

  /**
   * Força reconstrução da geometria com o estado atual
   */
  commitTransform() {
    if (!this.pendingTransform) return;
    const { position, normal, width, height, depth, angleRad } = this.pendingTransform;
    this.doFullRebuild(position, normal, width, height, depth, angleRad);
  }

  /**
   * Faz o rebuild completo da geometria
   */
  private doFullRebuild(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    angleRad: number
  ) {
    // Remove mesh anterior se existir
    if (this.mesh) {
      this.projected.dispose();
      this.mesh = null;
    }

    // Encontra o mesh alvo
    let target = this.pickTargetMesh(position, normal);
    if (!target) {
      target = this.findAnyMesh();
    }
    if (!target) return;

    const size = { width, height, depth: Math.max(depth, 50) };
    this.mesh = this.projected.build(target, position, normal, size, angleRad);

    if (this.mesh && !this.mesh.parent) {
      this.scene.add(this.mesh);
    }
  }

  setTransform(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    angleRad = 0,
    isPreview = false
  ) {
    // Salva estado pendente
    this.pendingTransform = {
      position: position.clone(),
      normal: normal.clone(),
      width,
      height,
      depth,
      angleRad,
    };

    // Durante preview/arrasto: usa ghost mesh (plano flutuante com opacidade)
    if ((isPreview || this.isDragging) && this.mesh) {
      this.createOrUpdateGhostMesh(position, normal, width, height, angleRad);
      return;
    }

    // Caso contrário, faz o rebuild completo
    this.doFullRebuild(position, normal, width, height, depth, angleRad);
  }

  update() {
    // Nada a fazer
  }

  updateTexture(texture: THREE.Texture) {
    this.texture = texture;
    
    // Atualiza a textura da ghost mesh se existir
    if (this.ghostMaterial) {
      this.ghostMaterial.map = texture;
      this.ghostMaterial.needsUpdate = true;
    }
    
    this.projected.setTexture(texture);
  }

  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  dispose() {
    this.removeGhostMesh();
    this.projected.dispose();
    this.mesh = null;
    this.root = null;
    this.pendingTransform = null;
  }
}
