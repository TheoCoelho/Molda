import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// Tipos alinhados com ExpandableSidebar
export type Tool = "select" | "brush" | "line" | "curve";
export type BrushVariant = "pencil" | "spray" | "marker" | "calligraphy";
export type ShapeKind = "rect" | "triangle" | "ellipse" | "polygon";

export type Editor2DHandle = {
  clear: () => void;
  exportPNG: () => string;
  addShape: (
    shape: ShapeKind,
    style?: {
      strokeColor?: string;
      fillColor?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  ) => void;

  toJSON: () => string;
  loadFromJSON: (json: string) => Promise<void>;
};

type Props = {
  tool: Tool;
  brushVariant: BrushVariant;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  lineMode: "single" | "polyline";
};

type FabricCanvas = any;

/** Converte #RRGGBB em rgba(r,g,b,a) para aplicar alpha quando necessário */
function withAlpha(color: string, alpha: number) {
  if (!color) return color;
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const full =
      hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
  return color;
}

// ---- Loader em runtime do Fabric (sem import local) ----
function loadFabricRuntime(): Promise<any> {
  // 1) Se já existe global, resolve já
  // @ts-ignore
  if (typeof window !== "undefined" && (window as any).fabric) {
    // @ts-ignore
    return Promise.resolve((window as any).fabric);
  }
  // 2) Se já estamos carregando, reusa a promise
  // @ts-ignore
  if ((window as any).__fabricLoadingPromise) {
    // @ts-ignore
    return (window as any).__fabricLoadingPromise;
  }
  // 3) Injeta <script> de CDN
  const tryUrls = [
    "https://unpkg.com/fabric@5.3.0/dist/fabric.min.js",
    "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js",
    "https://unpkg.com/fabric@4.6.0/dist/fabric.min.js",
  ];

  const loadFrom = (urlIndex: number): Promise<any> =>
    new Promise((resolve, reject) => {
      if (urlIndex >= tryUrls.length) {
        reject(new Error("Falha ao carregar Fabric de CDNs."));
        return;
      }
      const script = document.createElement("script");
      script.src = tryUrls[urlIndex];
      script.async = true;
      script.onload = () => {
        // @ts-ignore
        const fabric = (window as any).fabric;
        if (fabric) resolve(fabric);
        else loadFrom(urlIndex + 1).then(resolve).catch(reject);
      };
      script.onerror = () => {
        loadFrom(urlIndex + 1).then(resolve).catch(reject);
      };
      document.head.appendChild(script);
    });

  // @ts-ignore
  (window as any).__fabricLoadingPromise = loadFrom(0);
  // @ts-ignore
  return (window as any).__fabricLoadingPromise;
}

const Editor2D = forwardRef<Editor2DHandle, Props>(function Editor2D(
  { tool, brushVariant, strokeColor, fillColor, strokeWidth, opacity },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const domCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const listenersRef = useRef<{ down?: any; move?: any; up?: any }>({});

  // ---------- utils ----------
  const setHostCursor = (cursor: string) => {
    if (hostRef.current) hostRef.current.style.cursor = cursor;
    const c = canvasRef.current;
    if (c) {
      c.defaultCursor = cursor;
      c.hoverCursor = cursor === "default" ? "move" : cursor;
    }
  };

  const setObjectsSelectable = (c: any, selectable: boolean) => {
    c.forEachObject((o: any) => {
      o.selectable = selectable;
      o.evented = selectable;
    });
  };

  const detachLineListeners = (c: any) => {
    if (!c) return;
    if (listenersRef.current.down) c.off("mouse:down", listenersRef.current.down);
    if (listenersRef.current.move) c.off("mouse:move", listenersRef.current.move);
    if (listenersRef.current.up) c.off("mouse:up", listenersRef.current.up);
    listenersRef.current = {};
  };

  const ensureCanvasSize = () => {
    const c = canvasRef.current;
    const el = domCanvasRef.current;
    const host = hostRef.current;
    if (!host) return;

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;

    if (c && typeof c.setWidth === "function") {
      if (c.getWidth() !== w || c.getHeight() !== h) {
        c.setWidth(w);
        c.setHeight(h);
        c.renderAll();
      }
    } else if (el) {
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
    }
  };

  // ======== CALLIGRAPHY BRUSH — carimbo contínuo (sem buracos) + recorte ========
  const ensureCalligraphyBrush = (fabric: any) => {
    if (fabric.CalligraphyStampBrush) return fabric.CalligraphyStampBrush;

    class CalligraphyStampBrush extends fabric.BaseBrush {
      color: string = "#000";
      opacity: number = 1;
      nibSize: number = 12;   // comprimento da pena (lado maior)
      nibThin: number = 0.22; // proporção (lado menor = nibSize * nibThin)
      nibAngle: number = 35;  // graus
      _last?: { x: number; y: number };

      constructor(canvas: any) {
        super(canvas);
        (this as any).canvas = canvas;
      }

      private _topCtx(): CanvasRenderingContext2D | null {
        const cv: any = (this as any).canvas;
        const ctx = cv?.getTopContext ? cv.getTopContext() : cv?.contextTop || null;
        if (ctx) (ctx as any).imageSmoothingEnabled = true;
        return ctx || null;
      }

      /** vetor meia-largura com “sobra” para sobreposição e evitar frestas */
      private _halfVector() {
        const a = (this.nibAngle * Math.PI) / 180;
        const half = (this.nibSize * this.nibThin) / 2; // metade do lado menor
        const overshoot = Math.max(1.0, Math.min(2.0, half * 0.35)); // mais sobreposição
        const len = half + overshoot;
        return { hx: Math.cos(a) * len, hy: Math.sin(a) * len };
      }

      private _drawSegment(ctx: CanvasRenderingContext2D, p1: {x:number,y:number}, p2: {x:number,y:number}) {
        const { hx, hy } = this._halfVector();
        const a1 = { x: p1.x + hx, y: p1.y + hy };
        const b1 = { x: p1.x - hx, y: p1.y - hy };
        const a2 = { x: p2.x + hx, y: p2.y + hy };
        const b2 = { x: p2.x - hx, y: p2.y - hy };

        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
        ctx.fill();
      }

      onMouseDown(pointer: any) {
        this._last = { x: pointer.x, y: pointer.y };
        const ctx = this._topCtx();
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = "source-over"; // nunca apaga
        ctx.fillStyle = this.color;
        // start cap (segmento degenerado)
        this._drawSegment(ctx, this._last, { x: this._last.x + 0.001, y: this._last.y + 0.001 });
        ctx.restore();
      }

      onMouseMove(pointer: any) {
        if (!this._last) return;
        const ctx = this._topCtx();
        if (!ctx) return;

        const dx = pointer.x - this._last.x;
        const dy = pointer.y - this._last.y;
        const dist = Math.hypot(dx, dy);

        // amostragem bem densa para traço sólido
        const thin = Math.max(1, this.nibSize * this.nibThin);
        const spacing = Math.max(0.25, Math.min(thin * 0.06, 1.0)); // ~6% do lado fino
        const steps = Math.max(1, Math.ceil(dist / spacing));
        const stepx = dx / steps;
        const stepy = dy / steps;

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = this.color;

        let px = this._last.x, py = this._last.y;
        for (let i = 1; i <= steps; i++) {
          const nx = this._last.x + stepx * i;
          const ny = this._last.y + stepy * i;
          this._drawSegment(ctx, { x: px, y: py }, { x: nx, y: ny });
          px = nx; py = ny;
        }
        ctx.restore();

        this._last = { x: pointer.x, y: pointer.y };
      }

      /** Recorta apenas a região desenhada do upperCanvas (bounding box do alpha) */
      private _addCroppedImageFromUpper() {
        const cv: any = (this as any).canvas;
        const ctx = this._topCtx();
        if (!ctx) return;

        const src: HTMLCanvasElement = cv?.upperCanvasEl || ctx.canvas;
        const w = src.width, h = src.height;

        const srcCtx = src.getContext("2d")!;
        const imgData = srcCtx.getImageData(0, 0, w, h).data;

        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const a = imgData[i + 3];
            if (a > 0) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < minX || maxY < minY) return; // nada desenhado

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        const off = document.createElement("canvas");
        off.width = cropW;
        off.height = cropH;
        const offCtx = off.getContext("2d")!;
        offCtx.imageSmoothingEnabled = true;
        offCtx.drawImage(src, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

        const dataUrl = off.toDataURL("image/png");
        const fabricAny: any = (window as any).fabric;

        fabricAny.Image.fromURL(
          dataUrl,
          (img: any) => {
            img.set({
              left: minX,
              top: minY,
              selectable: true,
              evented: true,
              objectCaching: false,
            });
            cv.add(img);
            cv.requestRenderAll();
          },
          { crossOrigin: "anonymous" }
        );
      }

      onMouseUp() {
        this._addCroppedImageFromUpper(); // consolida só a região pintada
        // limpa somente o preview
        const cv: any = (this as any).canvas;
        const ctx = this._topCtx();
        if (ctx) {
          const el = cv?.upperCanvasEl || ctx.canvas;
          ctx.clearRect(0, 0, el.width, el.height);
        }
        this._last = undefined;
      }

      // API compatível com PencilBrush
      getColor() { return this.color; }
      setColor(c: string) { this.color = c; }
      getOpacity() { return this.opacity; }
      setOpacity(o: number) { this.opacity = o; }
      getBrushWidth() { return this.nibSize * this.nibThin; }
      setBrushWidth(w: number) { this.nibSize = Math.max(8, w / this.nibThin); }
    }

    fabric.CalligraphyStampBrush = CalligraphyStampBrush;
    return CalligraphyStampBrush;
  };

  const createBrush = (
    c: any,
    variant: BrushVariant,
    color: string,
    width: number,
    alpha: number
  ) => {
    const fabric = fabricRef.current;

    // lápis base
    let brush: any = new fabric.PencilBrush(c);
    brush.color = color;
    brush.width = width;
    brush.opacity = alpha;

    if (variant === "pencil") return brush;

    // ======= SPRAY (mantido) =======
    if (variant === "spray") {
      const particle = Math.max(1, Math.min(3, Math.round(width * 0.35)));
      const density = Math.max(14, Math.min(64, Math.round(60 - width * 2)));
      const col = withAlpha(color, alpha);

      if (fabric.SprayBrush) {
        const sb = new fabric.SprayBrush(c);
        sb.color = col;
        sb.width = Math.max(8, Math.min(64, Math.round(width * 6))); // área de dispersão
        sb.dotWidth = particle;
        sb.dotWidthVariance = Math.max(0.5, particle * 0.35);
        (sb as any).density = density;
        sb.opacity = 1;
        sb.randomOpacity = false;
        return sb;
      }

      if (fabric.CircleBrush) {
        const cb = new fabric.CircleBrush(c);
        cb.color = col;
        cb.width = particle;
        return cb;
      }

      const pb = new fabric.PencilBrush(c);
      pb.color = col;
      pb.width = Math.max(1, Math.floor(width * 0.6));
      pb.opacity = 1;
      return pb;
    }

    if (variant === "marker") {
      brush = new fabric.PencilBrush(c);
      brush.color = color;
      brush.width = Math.max(6, width * 1.8);
      brush.opacity = Math.min(1, Math.max(0.5, alpha));
      brush.strokeLineCap = "round";
      brush.strokeLineJoin = "round";
      return brush;
    }

    // ======= CALLIGRAPHY (carimbo contínuo, sólido) =======
    if (variant === "calligraphy") {
      const Stamp = ensureCalligraphyBrush(fabric);
      const cb: any = new Stamp(c);
      cb.opacity = alpha;
      cb.color = withAlpha(color, alpha); // “tinta”
      cb.nibSize = Math.max(8, width * 2.2); // comprimento da pena
      cb.nibThin = 0.22;                     // espessura relativa
      cb.nibAngle = 35;                      // inclinação da pena
      return cb;
    }

    return brush;
  };

  // ----------------------- init/cleanup -----------------------
  useEffect(() => {
    let disposed = false;

    const init = async () => {
      try {
        const fabric = await loadFabricRuntime();
        if (disposed || !hostRef.current) return;

        fabricRef.current = fabric;

        const el = document.createElement("canvas");
        el.style.width = "100%";
        el.style.height = "100%";
        el.width = hostRef.current.clientWidth;
        el.height = hostRef.current.clientHeight;
        hostRef.current.appendChild(el);

        const c = new fabric.Canvas(el, {
          selection: true,
          preserveObjectStacking: true,
        });
        c.setBackgroundColor("#ffffff", () => c.renderAll());

        canvasRef.current = c;
        domCanvasRef.current = el;

        // Resize responsivo
        roRef.current = new ResizeObserver(() => ensureCanvasSize());
        roRef.current.observe(hostRef.current);

        applyMode(); // modo inicial
      } catch {
        // Fallback 2D (sem fabric) — mantém export/clear
        if (!hostRef.current) return;
        const el = document.createElement("canvas");
        el.style.width = "100%";
        el.style.height = "100%";
        el.width = hostRef.current.clientWidth;
        el.height = hostRef.current.clientHeight;
        hostRef.current.appendChild(el);
        domCanvasRef.current = el;
        canvasRef.current = null;
      }
    };

    init();

    return () => {
      disposed = true;
      const c = canvasRef.current;
      try {
        if (c) {
          detachLineListeners(c);
          if (c.dispose) c.dispose();
        }
      } catch {}
      if (roRef.current && hostRef.current) {
        try { roRef.current.unobserve(hostRef.current); } catch {}
      }
      roRef.current = null;
      canvasRef.current = null;
      domCanvasRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reaplica modo em mudanças
  useEffect(() => {
    applyMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, brushVariant, strokeColor, fillColor, strokeWidth, opacity]);

  // ----------------------- modos -----------------------
  const applyMode = () => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    if (!c || !fabric) return;

    ensureCanvasSize();
    detachLineListeners(c);

    if (tool === "select") {
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      c.discardActiveObject();
      setHostCursor("default");
      c.renderAll();
      return;
    }

    if (tool === "brush" || tool === "curve") {
      c.isDrawingMode = true;
      c.selection = false;
      c.skipTargetFind = true;
      setObjectsSelectable(c, false);
      c.discardActiveObject();

      const b = createBrush(c, brushVariant, strokeColor, strokeWidth, opacity);
      c.freeDrawingBrush = b;
      setHostCursor("crosshair");
      c.renderAll();
      return;
    }

    if (tool === "line") {
      c.isDrawingMode = false;
      c.selection = false;
      c.skipTargetFind = true;
      setObjectsSelectable(c, false);
      c.discardActiveObject();

      let currentLine: any = null;

      const onDown = (opt: any) => {
        const pointer = c.getPointer(opt.e);
        currentLine = new fabric.Line(
          [pointer.x, pointer.y, pointer.x, pointer.y],
          {
            stroke: strokeColor,
            strokeWidth,
            opacity,
            selectable: true,
            evented: true,
          }
        );
        c.add(currentLine);
      };
      const onMove = (opt: any) => {
        if (!currentLine) return;
        const pointer = c.getPointer(opt.e);
        currentLine.set({ x2: pointer.x, y2: pointer.y });
        c.renderAll();
      };
      const onUp = () => {
        currentLine = null;
      };

      c.on("mouse:down", onDown);
      c.on("mouse:move", onMove);
      c.on("mouse:up", onUp);
      listenersRef.current = { down: onDown, move: onMove, up: onUp };

      setHostCursor("crosshair");
      c.renderAll();
      return;
    }
  };

  // ----------------------- ações públicas -----------------------
  const clear = () => {
    const c = canvasRef.current;
    if (c) {
      c.clear();
      c.setBackgroundColor("#ffffff", () => c.renderAll());
      return;
    }
    const el = domCanvasRef.current;
    if (el) {
      const ctx = el.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, el.width, el.height);
      }
    }
  };

  const exportPNG = () => {
    const c = canvasRef.current;
    if (c?.toDataURL) {
      return c.toDataURL({ format: "png", multiplier: 1 });
    }
    const el = domCanvasRef.current;
    return el ? el.toDataURL("image/png") : "";
  };

  const addShape = (
    shape: ShapeKind,
    style?: {
      strokeColor?: string;
      fillColor?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  ) => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    const s = {
      stroke: style?.strokeColor ?? strokeColor,
      fill: style?.fillColor ?? fillColor,
      strokeWidth: style?.strokeWidth ?? strokeWidth,
      opacity: style?.opacity ?? opacity,
    };

    if (c && fabric) {
      let obj: any = null;

      if (shape === "rect") {
        obj = new fabric.Rect({
          left: 80,
          top: 60,
          width: 180,
          height: 120,
          ...s,
        });
      } else if (shape === "triangle") {
        obj = new fabric.Triangle({
          left: 120,
          top: 60,
          width: 140,
          height: 140,
          ...s,
        });
      } else if (shape === "ellipse") {
        obj = new fabric.Ellipse({ left: 100, top: 80, rx: 90, ry: 60, ...s });
      } else if (shape === "polygon") {
        const cx = 200,
          cy = 140,
          r = 70,
          sides = 6;
        const pts = Array.from({ length: sides }, (_, i) => {
          const a = (i / sides) * Math.PI * 2;
          return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
        });
        obj = new fabric.Polygon(pts, { ...s, left: cx - r, top: cy - r });
      }

      if (obj) {
        obj.selectable = true;
        obj.evented = true;
        c.add(obj);
        c.setActiveObject(obj);
        c.renderAll();
      }
      return;
    }

    // fallback 2D simples
    const el = domCanvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    ctx.globalAlpha = s.opacity ?? 1;
    ctx.strokeStyle = s.stroke ?? "#000";
    ctx.fillStyle = s.fill ?? "transparent";
    ctx.lineWidth = s.strokeWidth ?? 2;

    if (shape === "rect") {
      ctx.strokeRect(80, 60, 180, 120);
    } else if (shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(120, 200);
      ctx.lineTo(260, 60);
      ctx.lineTo(300, 200);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(200, 140, 90, 60, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (shape === "polygon") {
      const cx = 200,
        cy = 140,
        r = 70,
        sides = 6;
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  };

  const toJSON = () => {
    const c = canvasRef.current;
    if (c?.toDatalessJSON) {
      try {
        const data = c.toDatalessJSON();
        return JSON.stringify({ kind: "fabric", data });
      } catch {}
    }
    const dataUrl = exportPNG();
    return JSON.stringify({ kind: "png", dataUrl });
  };

  const loadFromJSON = async (json: string) => {
    if (!json) return;
    const parsed = JSON.parse(json);
    const c = canvasRef.current;

    if (parsed?.kind === "fabric" && c?.loadFromJSON) {
      await new Promise<void>((resolve, reject) => {
        try {
          c.loadFromJSON(parsed.data, () => {
            c.renderAll();
            resolve();
          });
        } catch (e) {
          reject(e);
        }
      });
      return;
    }

    const dataUrl: string | undefined = parsed?.dataUrl;
    if (!dataUrl) return;

    if (c?.setBackgroundImage) {
      await new Promise<void>((resolve) => {
        c.setBackgroundImage(
          dataUrl,
          () => {
            c.renderAll();
            resolve();
          },
          { crossOrigin: "anonymous" }
        );
      });
      return;
    }

    const el = domCanvasRef.current;
    if (!el) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(img, 0, 0, el.width, el.height);
    };
    img.src = dataUrl;
  };

  useImperativeHandle(ref, () => ({
    clear,
    exportPNG,
    addShape,
    toJSON,
    loadFromJSON,
  }));

  return (
    <div
      ref={hostRef}
      className="w-full h-full"
      style={{ background: "#fff", touchAction: "none" }}
    />
  );
});

export default Editor2D;
