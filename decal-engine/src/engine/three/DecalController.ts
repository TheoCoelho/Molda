import { Raycaster, Vector2, Camera, Intersection, Object3D } from "three";

export class DecalController {
  private ray = new Raycaster();
  private ndc = new Vector2();

  constructor(private camera: Camera, private targetRoot: Object3D) {}

  /** Converte clique de tela → UV (0..1). Retorna null se a face não tiver UV. */
  pickUV(clientX: number, clientY: number, dom: HTMLElement) {
    const r = dom.getBoundingClientRect();
    this.ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -(((clientY - r.top) / r.height) * 2 - 1)
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits: Intersection[] = this.ray.intersectObject(this.targetRoot, true);
    const h = hits.find(x => x.uv);
    return h?.uv ? { u: h.uv.x, v: h.uv.y } : null;
  }

  /** Retorna a primeira interseção encontrada (inclusive sem UV). */
  pickHit(clientX: number, clientY: number, dom: HTMLElement) {
    const r = dom.getBoundingClientRect();
    this.ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -(((clientY - r.top) / r.height) * 2 - 1)
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits: Intersection[] = this.ray.intersectObject(this.targetRoot, true);
    return hits[0] ?? null;
  }
}
