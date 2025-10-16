import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";

export type DecalSize = { width: number; height: number; depth?: number };

/**
 * Utilitário para projetar um decal (logo.png) diretamente na geometria
 * usando DecalGeometry, evitando dependência de UVs e Fabric.
 */
export class DecalPlacer {
  private texturePromise: Promise<THREE.Texture>;

  constructor(private scene: THREE.Scene, logoUrl = "/assets/logo.png") {
    const loader = new THREE.TextureLoader();
    this.texturePromise = loader.loadAsync(logoUrl).then((tex) => {
      if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
      else (tex as any).encoding = THREE.sRGBEncoding;
      tex.anisotropy = 16;
      // Manter flipY padrão do TextureLoader
      return tex;
    });
  }

  private async getTexture() { return this.texturePromise; }

  private async buildGeometry(target: THREE.Mesh, point: THREE.Vector3, normal: THREE.Vector3, size: DecalSize) {
    const texture = await this.getTexture();
    const orientation = new THREE.Euler();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().normalize());
    orientation.setFromQuaternion(q);
    const geom = new DecalGeometry(
      target,
      point,
      orientation,
      new THREE.Vector3(
        size.width,
        size.height,
        size.depth ?? Math.max(size.width, size.height) * 0.5
      )
    );
    return geom as THREE.BufferGeometry;
  }

  private async buildMaterial() {
    const texture = await this.getTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -10,
      polygonOffsetUnits: -10,
    });
    return mat;
  }

  async place(target: THREE.Mesh, point: THREE.Vector3, normal: THREE.Vector3, size: DecalSize) {
    const geom = await this.buildGeometry(target, point, normal, size);
    const mat = await this.buildMaterial();
    const decalMesh = new THREE.Mesh(geom, mat);
    decalMesh.renderOrder = 999;
    this.scene.add(decalMesh);
    return decalMesh;
  }

  async update(existing: THREE.Mesh, target: THREE.Mesh, point: THREE.Vector3, normal: THREE.Vector3, size: DecalSize) {
    const newGeom = await this.buildGeometry(target, point, normal, size);
    const old = existing.geometry as THREE.BufferGeometry;
    existing.geometry = newGeom;
    old.dispose();
    existing.renderOrder = 999;
  }
}



