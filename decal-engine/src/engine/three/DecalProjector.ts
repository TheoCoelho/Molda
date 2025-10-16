import { Mesh, MeshBasicMaterial, PlaneGeometry, TextureLoader, Vector3, Quaternion } from "three";

/** Cria um plano com a textura do logo, orientado pela normal do ponto de clique. */
export class DecalProjector {
  private loader = new TextureLoader();

  constructor(private scene: THREE.Scene) {}

  async addLogoAt(position: Vector3, normal: Vector3, size = { w: 0.25, h: 0.12 }) {
    const tex = await this.loader.loadAsync("/assets/logo.png");
    tex.colorSpace = (tex as any).colorSpace ?? (THREE as any).SRGBColorSpace;

    const geo = new PlaneGeometry(size.w, size.h);
    const mat = new MeshBasicMaterial({ map: tex, transparent: true });
    const plane = new Mesh(geo, mat);

    plane.position.copy(position);

    // Orienta o plano para "encarar" a direção da normal
    const z = normal.clone().normalize();
    const x = new Vector3(1, 0, 0);
    if (Math.abs(z.dot(x)) > 0.99) x.set(0, 1, 0);
    const y = new Vector3().crossVectors(z, x).normalize();
    x.crossVectors(y, z).normalize();
    const q = new Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    plane.quaternion.copy(q);

    // Move um pouco para fora da superfície para evitar z-fighting
    plane.position.add(normal.clone().multiplyScalar(0.001));

    this.scene.add(plane);
    return plane;
  }
}



