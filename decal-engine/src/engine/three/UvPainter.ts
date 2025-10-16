import { Texture }from "three";
import { FabricBoard } from "../FabricBoard";

/** Faz o push do Fabric Canvas para a THREE.Texture (material.map). */
export class UvPainter {
  constructor(private board: FabricBoard, private targetTexture: Texture) {}

  pushToTexture() {
    const c = this.board.toCanvas();
    if (this.targetTexture.image !== c) {
      this.targetTexture.image = c; // primeira vez
    }
    this.targetTexture.needsUpdate = true;
  }
}
