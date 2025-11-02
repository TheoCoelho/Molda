import * as THREE from "three";
import SurfaceDecal, { SurfaceDecalOptions } from "./SurfaceDecal";

/**
 * Adapta SurfaceDecal para a mesma "cara" do ProjectionDecal
 * (setTransform/attachTo/update), para reaproveitar a UI atual.
 */
export default class MeshDecalAdapter {
  private surface: SurfaceDecal;
  private root: THREE.Object3D | null = null;
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private ray: THREE.Raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene, texture: THREE.Texture, opts: SurfaceDecalOptions = {}) {
    this.scene = scene;
    this.surface = new SurfaceDecal(texture, opts);
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

  setTransform(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    angleRad = 0
  ) {
    const target = this.pickTargetMesh(position, normal);
    if (!target) return;

    const size = { width, height, depth };
    const m = this.surface.build(target, position, normal, size, angleRad);

    if (!this.mesh) {
      this.mesh = m;
      this.scene.add(m);
    }
  }

  update() {
    // nada a fazer; malha já está pronta
  }
}
