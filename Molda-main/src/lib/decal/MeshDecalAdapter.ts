import * as THREE from "three";
import SurfaceDecal, { SurfaceDecalOptions } from "./SurfaceDecal";

/**
 * Adapta SurfaceDecal para a mesma "cara" do ProjectionDecal
 * (setTransform/attachTo/update), para reaproveitar a UI atual.
 *
 * OTIMIZAÇÃO DE PERFORMANCE:
 * - Durante arrasto: mostra ghost mesh (plano simples à frente do modelo com opacidade)
 * - Ao finalizar: reconstrói a geometria precisa na superfície
 */
export default class MeshDecalAdapter {
  private surface: SurfaceDecal;
  private root: THREE.Object3D | null = null;
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private ray: THREE.Raycaster = new THREE.Raycaster();
  private opts: SurfaceDecalOptions;

  // Estado para preview rápido durante arrasto
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
  private static readonly GHOST_OPACITY = 0.55;
  private static readonly GHOST_OFFSET = 0.025;

  constructor(scene: THREE.Scene, texture: THREE.Texture, opts: SurfaceDecalOptions = {}) {
    this.scene = scene;
    this.opts = { ...opts };
    this.surface = new SurfaceDecal(texture, this.opts);
  }

  attachTo(root: THREE.Object3D) {
    this.root = root;
  }

  /**
   * Encontra o mesh mais provável sob o ponto usando um pequeno raycast
   * ao longo da normal (origem deslocada +normal, direção -normal).
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
      const tex = (this.surface as any).texture as THREE.Texture | undefined;
      this.ghostMaterial = new THREE.MeshBasicMaterial({
        map: tex ?? null,
        transparent: true,
        opacity: MeshDecalAdapter.GHOST_OPACITY,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
    }

    // Cria a geometria se não existir
    if (!this.ghostMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      this.ghostMesh = new THREE.Mesh(geometry, this.ghostMaterial);
      this.ghostMesh.renderOrder = 999;
      this.scene.add(this.ghostMesh);
    }

    // Posiciona a ghost mesh um pouco à frente da superfície
    const offsetPosition = position.clone().add(
      normal.clone().multiplyScalar(MeshDecalAdapter.GHOST_OFFSET)
    );
    this.ghostMesh.position.copy(offsetPosition);

    // Escala para o tamanho do decal
    this.ghostMesh.scale.set(width, height, 1);

    // Orienta a mesh para ficar perpendicular à normal
    const normalDir = normal.clone().normalize();

    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normalDir.dot(up)) > 0.99) {
      up = new THREE.Vector3(1, 0, 0);
    }

    const right = new THREE.Vector3().crossVectors(up, normalDir).normalize();
    const realUp = new THREE.Vector3().crossVectors(normalDir, right).normalize();

    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(right, realUp, normalDir);

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
      if (this.mesh) {
        this.mesh.visible = false;
      }
    }

    if (wasDragging && !dragging) {
      this.removeGhostMesh();
      if (this.pendingTransform) {
        this.commitTransform();
      }
      if (this.mesh) {
        this.mesh.visible = true;
      }
    }
  }

  /**
   * Força reconstrução da geometria com o estado pendente
   */
  commitTransform() {
    if (!this.pendingTransform) return;
    const { position, normal, width, height, depth, angleRad } = this.pendingTransform;
    const target = this.pickTargetMesh(position, normal);
    if (!target) return;
    const size = { width, height, depth };
    const m = this.surface.build(target, position, normal, size, angleRad);
    if (!this.mesh) {
      this.mesh = m;
      this.scene.add(m);
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

    // Se não tem mesh ainda, faz rebuild completo (primeira vez)
    if (!this.mesh) {
      const target = this.pickTargetMesh(position, normal);
      if (!target) return;
      const size = { width, height, depth };
      const m = this.surface.build(target, position, normal, size, angleRad);
      this.mesh = m;
      this.scene.add(m);
      return;
    }

    // Durante preview/arrasto: usa ghost mesh
    if ((isPreview || this.isDragging) && this.mesh) {
      this.createOrUpdateGhostMesh(position, normal, width, height, angleRad);
      return;
    }

    // Caso contrário, faz rebuild completo
    const target = this.pickTargetMesh(position, normal);
    if (!target) return;
    const size = { width, height, depth };
    this.surface.build(target, position, normal, size, angleRad);
  }

  update() {
    // nada a fazer; malha já está pronta
  }

  updateTexture(texture: THREE.Texture) {
    if (this.ghostMaterial) {
      this.ghostMaterial.map = texture;
      this.ghostMaterial.needsUpdate = true;
    }

    if (this.surface && this.mesh) {
      this.surface.setTexture(texture);
      return;
    }
    if (!this.surface) {
      this.surface = new SurfaceDecal(texture, this.opts);
    } else {
      this.surface.setTexture(texture);
    }
  }

  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  dispose() {
    this.removeGhostMesh();
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
    if (this.surface) {
      this.surface.dispose();
    }
    this.root = null;
    this.pendingTransform = null;
  }
}
