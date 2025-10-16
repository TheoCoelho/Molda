// Compat do import com diferentes builds do Fabric
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as FabricNS from "fabric";
const fabric: any = (FabricNS as any).fabric ?? (FabricNS as any).default ?? FabricNS;

/** Canvas UV baseado em Fabric.js — edita a textura 2D (albedo). */
export class FabricBoard {
  canvas: any;

  constructor(public width = 2048, public height = 2048, mount?: HTMLCanvasElement) {
    this.canvas = new fabric.Canvas(mount ?? document.createElement("canvas"), {
      width,
      height,
      renderOnAddRemove: true,
      preserveObjectStacking: true,
    } as any);
  }

  /**
   * Adiciona uma imagem (logo/PNG/SVG rasterizado) como decal.
   * Retorna uma Promise que resolve após a imagem estar desenhada no canvas.
   */
  addImageDecal(
    src: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: any
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      fabric.Image.fromURL(
        src,
        (img: any) => {
          try {
            // Centraliza o decal na posição dada (x,y) usando origin center
            img.set({ left: x, top: y, originX: "center", originY: "center", selectable: true, ...(opts || {}) });
            // Define o tamanho absoluto desejado (em pixels do canvas)
            if (w && img.width) img.scaleToWidth(w);
            if (h && img.height) img.scaleToHeight(h);
            this.canvas.add(img);
            this.canvas.renderAll();
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        { crossOrigin: "anonymous" }
      );
    });
  }

  /** Acesso ao elemento <canvas> que serve de textura. */
  toCanvas(): HTMLCanvasElement {
    return this.canvas.getElement() as HTMLCanvasElement;
  }
}
