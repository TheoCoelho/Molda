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
  private previousMesh: THREE.Mesh | null = null; // Rastreia mesh anterior for cleanup

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

  constructor(scene: THREE.Scene, texture: THREE.Texture, opts: any = {}) {
    this.scene = scene;
    this.texture = texture;
    const minFacing =
      typeof opts?.normalAlignmentMin === "number" ? opts.normalAlignmentMin : -0.3;
    this.projected = new ProjectedTextureDecal(texture, {
      depth: 10, // Profundidade pequena: pega apenas superfície imediata, evita distorção
      opacity: 1.0,
      feather: 0.05, // Feather suave nas bordas
      minFacing: 0.3, // Aceita apenas faces bem alinhadas com o projetor (mantém formato)
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
      // Faz rebuild PRIMEIRO para criar nova mesh, DEPOIS torna visível
      if (this.pendingTransform) {
        this.commitTransform();
      }
      // Agora torna o novo mesh visível
      if (this.mesh) {
        this.mesh.visible = true;
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
    // Cleanup agressivo: remove ANTERIOR completamente
    if (this.previousMesh) {
      if (this.previousMesh.parent) {
        this.previousMesh.parent.remove(this.previousMesh);
      }
      if (this.previousMesh.geometry) {
        this.previousMesh.geometry.dispose();
      }
      if (this.previousMesh.material) {
        const mat = this.previousMesh.material;
        if (Array.isArray(mat)) {
          mat.forEach(m => m.dispose());
        } else {
          mat.dispose();
        }
      }
      this.previousMesh = null;
    }

    // Se já existe mesh atual, salva como anterior
    if (this.mesh) {
      this.previousMesh = this.mesh;
      this.mesh = null;
    }

    // IMPORTANTE: dispose DEPOIS de salvar anterior, antes de build
    if (this.projected) {
      this.projected.dispose();
    }
    this.projected = new ProjectedTextureDecal(this.texture, {
      depth: 10, // Profundidade pequena: pega apenas superfície imediata
      opacity: 1.0,
      feather: 0.05,
      minFacing: 0.3, // Aceita apenas faces bem alinhadas (evita distorção)
    });

    // Encontra o mesh alvo
    let target = this.pickTargetMesh(position, normal);
    if (!target) {
      target = this.findAnyMesh();
    }
    if (!target) {
      console.warn("[ProjectedDecalAdapter] Nenhum mesh alvo encontrado");
      return;
    }

    const size = { width, height, depth: Math.max(depth, 10) };
    this.mesh = this.projected.build(target, position, normal, size, angleRad);

    // Adiciona o novo mesh à cena se não tiver parent
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

    // Se não tem mesh ainda OU não está em modo preview, faz rebuild
    if (!this.mesh) {
      this.doFullRebuild(position, normal, width, height, depth, angleRad);
      return;
    }

    // Durante preview/arrasto com mesh existente: usa ghost mesh
    if ((isPreview || this.isDragging) && this.mesh) {
      this.createOrUpdateGhostMesh(position, normal, width, height, angleRad);
      return;
    }

    // Caso contrário (não preview, não arrasto, com mesh), faz rebuild completo
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
    
    // Cleanup do mesh atual
    if (this.mesh) {
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      this.mesh = null;
    }
    
    // Cleanup do mesh anterior
    if (this.previousMesh) {
      if (this.previousMesh.parent) {
        this.previousMesh.parent.remove(this.previousMesh);
      }
      if (this.previousMesh.geometry) {
        this.previousMesh.geometry.dispose();
      }
      this.previousMesh = null;
    }
    
    this.projected.dispose();
    this.root = null;
    this.pendingTransform = null;
  }
}
