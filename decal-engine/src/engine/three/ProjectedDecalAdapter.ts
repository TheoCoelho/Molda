import * as THREE from "three";
import ProjectedTextureDecal from "./ProjectedTextureDecal";

/**
 * ProjectedDecalAdapter: adapta ProjectedTextureDecal para a API do MeshDecalAdapter.
 * Projeta a textura inteira sobre o objeto, sem cortar por faces.
 */
export default class ProjectedDecalAdapter {
  private projected: ProjectedTextureDecal;
  private root: THREE.Object3D | null = null;
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private ray: THREE.Raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene, texture: THREE.Texture, _opts: any = {}) {
    this.scene = scene;
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

  setTransform(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    angleRad = 0
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

  update() {
    // Nada a fazer
  }

  updateTexture(texture: THREE.Texture) {
    this.projected.setTexture(texture);
  }

  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  dispose() {
    this.projected.dispose();
    this.mesh = null;
    this.root = null;
  }
}
