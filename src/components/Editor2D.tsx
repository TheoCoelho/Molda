import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/** Types usados pelo app */
export type Tool = "select" | "brush" | "line" | "curve";
export type BrushVariant = "pencil" | "spray" | "marker" | "calligraphy";
export type ShapeKind = "rect" | "ellipse" | "triangle" | "polygon";

export type Editor2DHandle = {
  clear: () => void;
  exportPNG: () => string;
  addShape: (
    shape: ShapeKind,
    style?: { strokeColor?: string; fillColor?: string; strokeWidth?: number; opacity?: number }
  ) => void;
};

type Props = {
  tool: Tool;
  brushVariant: BrushVariant;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number; // 0..1
  lineMode: "single" | "polyline"; // NOVO
};

/** Carrega Fabric via CDN para evitar o erro de import em Vite */
async function ensureFabric(): Promise<any> {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.fabric) return w.fabric;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar Fabric.js do CDN"));
    document.head.appendChild(script);
  });
  return (window as any).fabric;
}

const Editor2D = forwardRef<Editor2DHandle, Props>(function Editor2D(
  { tool, brushVariant, strokeColor, fillColor, strokeWidth, opacity, lineMode },
  ref
) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const fabricNS = useRef<any>(null);
  const canvasRef = useRef<any | null>(null);

  const drawingRef = useRef<{
    line?: any;      // linha simples "arrastar-soltar"
    poly?: any;      // polilinha em construção
    phase: 0 | 1;    // curva: 0 endpoints, 1 controle
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    dbl?: (e: MouseEvent) => void; // handler dblclick para polilinha
  }>({ phase: 0 });

  useEffect(() => {
    let disposed = false;

    (async () => {
      const fabric = await ensureFabric();
      if (disposed || !fabric) return;
      fabricNS.current = fabric;

      if (!holderRef.current) return;

      const el = document.createElement("canvas");
      el.className = "w-full h-full block";
      holderRef.current.innerHTML = "";
      holderRef.current.appendChild(el);

      const canvas = new fabric.Canvas(el, {
        backgroundColor: "transparent",
        selection: tool === "select",
        preserveObjectStacking: true,
      });
      canvasRef.current = canvas;

      // resize
      const resize = () => {
        if (!holderRef.current) return;
        const rect = holderRef.current.getBoundingClientRect();
        canvas.setWidth(rect.width);
        canvas.setHeight(rect.height);
        canvas.renderAll();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(holderRef.current);

      // ========== Eventos ==========
      const onMouseDown = (opt: any) => {
        const c = canvasRef.current;
        if (!c) return;
        const pointer = c.getPointer(opt.e);

        if (tool === "line") {
          if (lineMode === "single") {
            const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
              stroke: strokeColor,
              strokeWidth,
              opacity,
              selectable: true,
              evented: true,
            });
            drawingRef.current.line = line;
            c.add(line);
          } else {
            // POLILINHA
            if (!drawingRef.current.poly) {
              const points = [{ x: pointer.x, y: pointer.y }, { x: pointer.x, y: pointer.y }];
              const poly = new fabric.Polyline(points, {
                fill: "",
                stroke: strokeColor,
                strokeWidth,
                opacity,
                selectable: false,
                evented: false,
              });
              drawingRef.current.poly = poly;
              c.add(poly);

              // Duplo-clique para finalizar a polilinha
              const dbl = (e: MouseEvent) => {
                if (!drawingRef.current.poly) return;
                // Finaliza: torna selecionável e limpa estado
                drawingRef.current.poly.set({ selectable: true, evented: true });
                c.setActiveObject(drawingRef.current.poly);
                drawingRef.current.poly = undefined;
                c.requestRenderAll();
              };
              drawingRef.current.dbl = dbl;
              c.upperCanvasEl.addEventListener("dblclick", dbl);
            } else {
              // adiciona novo ponto fixo (o último ponto segue o mouse)
              const poly = drawingRef.current.poly as any;
              const pts = poly.points.slice();
              pts[pts.length - 1] = { x: pointer.x, y: pointer.y };
              pts.push({ x: pointer.x, y: pointer.y });
              poly.set({ points: pts });
              c.requestRenderAll();
            }
          }
        } else if (tool === "curve") {
          if (drawingRef.current.phase === 0) {
            drawingRef.current.start = { x: pointer.x, y: pointer.y };
            const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
              stroke: strokeColor,
              strokeWidth,
              opacity,
              selectable: false,
              evented: false,
            });
            drawingRef.current.line = line;
            c.add(line);
          } else {
            const start = drawingRef.current.start!;
            const end = drawingRef.current.end!;
            const ctrl = { x: pointer.x, y: pointer.y };
            const pathStr = `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`;
            const path = new fabric.Path(pathStr, {
              fill: "",
              stroke: strokeColor,
              strokeWidth,
              opacity,
              selectable: true,
              evented: true,
            });
            c.remove(drawingRef.current.line!);
            drawingRef.current.line = undefined;
            drawingRef.current.phase = 0;
            drawingRef.current.start = undefined;
            drawingRef.current.end = undefined;
            c.add(path);
            c.setActiveObject(path);
            c.requestRenderAll();
          }
        }
      };

      const onMouseMove = (opt: any) => {
        const c = canvasRef.current;
        if (!c) return;
        const pointer = c.getPointer(opt.e as MouseEvent);

        if (tool === "line") {
          if (lineMode === "single" && drawingRef.current.line) {
            drawingRef.current.line.set({ x2: pointer.x, y2: pointer.y });
            c.requestRenderAll();
          } else if (lineMode === "polyline" && drawingRef.current.poly) {
            const poly = drawingRef.current.poly as any;
            const pts = poly.points.slice();
            pts[pts.length - 1] = { x: pointer.x, y: pointer.y };
            poly.set({ points: pts });
            c.requestRenderAll();
          }
        } else if (tool === "curve" && drawingRef.current.line) {
          drawingRef.current.line.set({ x2: pointer.x, y2: pointer.y });
          c.requestRenderAll();
        }
      };

      const onMouseUp = () => {
        const c = canvasRef.current;
        if (!c) return;

        if (tool === "line") {
          if (lineMode === "single" && drawingRef.current.line) {
            c.setActiveObject(drawingRef.current.line);
            drawingRef.current.line = undefined;
          }
        } else if (tool === "curve") {
          if (drawingRef.current.phase === 0 && drawingRef.current.line) {
            const line = drawingRef.current.line;
            drawingRef.current.end = { x: line.x2!, y: line.y2! };
            drawingRef.current.phase = 1; // próximo clique define ponto de controle
          }
        }
      };

      canvas.on("mouse:down", onMouseDown);
      canvas.on("mouse:move", onMouseMove);
      canvas.on("mouse:up", onMouseUp);

      return () => {
        ro.disconnect();
        if (drawingRef.current.dbl) {
          canvas.upperCanvasEl.removeEventListener("dblclick", drawingRef.current.dbl);
          drawingRef.current.dbl = undefined;
        }
        canvas.off("mouse:down", onMouseDown);
        canvas.off("mouse:move", onMouseMove);
        canvas.off("mouse:up", onMouseUp);
        canvas.dispose();
        canvasRef.current = null;
      };
    })();

    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount 1x

  // Troca de modo (seleção vs desenho)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.isDrawingMode = tool === "brush";
    c.selection = tool === "select";

    // cancelar estados pendentes ao sair de "curve" ou finalizar polilinha
    if (tool !== "curve") {
      drawingRef.current.phase = 0;
      drawingRef.current.line = undefined;
      drawingRef.current.start = undefined;
      drawingRef.current.end = undefined;
    }
    if (tool !== "line" && drawingRef.current.poly) {
      // finaliza automaticamente polilinha inacabada
      const poly = drawingRef.current.poly;
      poly.set({ selectable: true, evented: true });
      drawingRef.current.poly = undefined;
      if (drawingRef.current.dbl && c?.upperCanvasEl) {
        c.upperCanvasEl.removeEventListener("dblclick", drawingRef.current.dbl);
        drawingRef.current.dbl = undefined;
      }
    }

    c.discardActiveObject();
    c.requestRenderAll();
  }, [tool]);

  // Brush variants
  useEffect(() => {
    const c = canvasRef.current;
    const fabric = fabricNS.current;
    if (!c || !fabric || tool !== "brush") return;

    const makeMarkerBrush = () => {
      const brush = new fabric.PatternBrush(c);
      brush.getPatternSrc = function () {
        const patternCanvas = document.createElement("canvas");
        const size = Math.max(8, strokeWidth);
        patternCanvas.width = size;
        patternCanvas.height = size;
        const ctx = patternCanvas.getContext("2d")!;
        ctx.fillStyle = strokeColor;
        ctx.fillRect(0, 0, size, size * 0.6);
        return patternCanvas;
      };
      brush.width = strokeWidth;
      // @ts-expect-error
      brush.opacity = opacity;
      // @ts-expect-error
      brush.color = strokeColor;
      return brush;
    };

    const makeCalligraphyBrush = () => {
      const brush = new fabric.PatternBrush(c);
      brush.getPatternSrc = function () {
        const patternCanvas = document.createElement("canvas");
        const size = Math.max(10, strokeWidth);
        patternCanvas.width = size;
        patternCanvas.height = size;
        const ctx = patternCanvas.getContext("2d")!;
        ctx.fillStyle = strokeColor;
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate((-25 * Math.PI) / 180);
        ctx.fillRect(-size * 0.6, -size * 0.15, size * 1.2, size * 0.3);
        ctx.restore();
        return patternCanvas;
      };
      brush.width = strokeWidth;
      // @ts-expect-error
      brush.opacity = opacity;
      // @ts-expect-error
      brush.color = strokeColor;
      return brush;
    };

    if (brushVariant === "pencil") {
      const b = new fabric.PencilBrush(c);
      b.width = strokeWidth;
      // @ts-expect-error
      b.opacity = opacity;
      // @ts-expect-error
      b.color = strokeColor;
      c.freeDrawingBrush = b;
    } else if (brushVariant === "spray") {
      const b = new fabric.SprayBrush(c);
      b.width = strokeWidth;
      // @ts-expect-error
      b.opacity = opacity;
      // @ts-expect-error
      b.color = strokeColor;
      c.freeDrawingBrush = b;
    } else if (brushVariant === "marker") {
      c.freeDrawingBrush = makeMarkerBrush();
    } else if (brushVariant === "calligraphy") {
      c.freeDrawingBrush = makeCalligraphyBrush();
    }

    c.requestRenderAll();
  }, [tool, brushVariant, strokeColor, strokeWidth, opacity]);

  // API para o pai
  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvasRef.current;
      if (!c) return;
      c.clear();
      c.setBackgroundColor("transparent", () => {});
      c.requestRenderAll();
    },
    exportPNG() {
      const c = canvasRef.current;
      if (!c) return "";
      return c.toDataURL({ format: "png", enableRetinaScaling: true });
    },
    addShape(shape, style) {
      const c = canvasRef.current;
      const fabric = fabricNS.current;
      if (!c || !fabric) return;

      const w = c.getWidth();
      const h = c.getHeight();
      const cx = w / 2;
      const cy = h / 2;

      const stroke = style?.strokeColor ?? "#000";
      const fill = style?.fillColor ?? "";
      const sw = style?.strokeWidth ?? 3;
      const op = style?.opacity ?? 1;

      let obj: any = null;
      if (shape === "rect") {
        obj = new fabric.Rect({ left: cx - 60, top: cy - 40, width: 120, height: 80, stroke, fill, strokeWidth: sw, opacity: op });
      } else if (shape === "ellipse") {
        obj = new fabric.Ellipse({ left: cx - 60, top: cy - 40, rx: 60, ry: 40, stroke, fill, strokeWidth: sw, opacity: op });
      } else if (shape === "triangle") {
        obj = new fabric.Triangle({ left: cx - 55, top: cy - 45, width: 110, height: 90, stroke, fill, strokeWidth: sw, opacity: op });
      } else if (shape === "polygon") {
        const sides = 5;
        const radius = 60;
        const points = Array.from({ length: sides }, (_, i) => {
          const ang = (i / sides) * Math.PI * 2 - Math.PI / 2;
          return { x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) };
        });
        obj = new fabric.Polygon(points, { left: cx - radius, top: cy - radius, stroke, fill, strokeWidth: sw, opacity: op });
      }
      if (obj) {
        c.add(obj);
        c.setActiveObject(obj);
        c.requestRenderAll();
      }
    },
  }));

  return <div ref={holderRef} className="w-full h-full" />;
});

export default Editor2D;
