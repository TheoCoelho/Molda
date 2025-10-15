// src/components/Editor2D.tsx
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import HistoryManager from "../lib/HistoryManager";
import { ensureFontForFabric } from "../utils/fonts";

// Tipos alinhados com ExpandableSidebar
export type Tool = "select" | "brush" | "line" | "curve" | "text";
export type BrushVariant = "pencil" | "spray" | "marker" | "calligraphy";
export type ShapeKind = "rect" | "triangle" | "ellipse" | "polygon";

/** Estilo de texto suportado pelo editor */
export type TextStyle = Partial<{
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number;
  charSpacing: number;
  underline: boolean;
  linethrough: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadow: { color: string; blur: number; offsetX: number; offsetY: number } | null;
}>;

export type Editor2DHandle = {
  // ---- Histórico ----
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  historyCapture: () => void;

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
  addImage: (
    src: string,
    opts?: { x?: number; y?: number; scale?: number }
  ) => void;

  toJSON: () => string;
  loadFromJSON: (json: string) => Promise<void>;
  deleteSelection: () => void;

  // ==== Texto ====
  addText: (value?: string, opts?: { x?: number; y?: number }) => void;

  /** leitura/aplicação de estilo do texto ativo */
  getActiveTextStyle: () => TextStyle | null;
  setActiveTextStyle: (patch: TextStyle & { from?: "font-picker" | "inspector" }) => Promise<void>;

  /** Retrocompatibilidade */
  applyTextStyle: (patch: TextStyle) => void;

  /** listeners de seleção ("none" | "text" | "other") */
  onSelectionChange?: (cb: (k: "none" | "text" | "other") => void) => void;
};

type Props = {
  tool: Tool;
  brushVariant: BrushVariant;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  lineMode: "single" | "polyline";
  isTrashMode?: boolean;
  onTrashDelete?: () => void;

  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;

  /** Para autoabrir a UI de Texto quando um IText for selecionado (mantido) */
  onTextFocusRequest?: () => void;
};

type FabricCanvas = any;

/** Converte #RRGGBB em rgba(r,g,b,a) para aplicar alpha quando necessário */
function withAlpha(color: string, alpha: number) {
  if (!color) return color;
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
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
  // Reutiliza promise se já estiver em andamento
  // @ts-ignore
  if (typeof window !== "undefined" && (window as any).fabric) {
    // @ts-ignore
    return Promise.resolve((window as any).fabric);
  }
  // @ts-ignore
  if ((window as any).__fabricLoadingPromise) {
    // @ts-ignore
    return (window as any).__fabricLoadingPromise;
  }

  const cdns = [
    "https://unpkg.com/fabric@5.3.0/dist/fabric.min.js",
    "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js",
    "https://unpkg.com/fabric@4.6.0/dist/fabric.min.js",
  ];

  function loadFrom(i: number): Promise<any> {
    return new Promise((resolve, reject) => {
      if (i >= cdns.length) {
        reject(new Error("Falha ao carregar Fabric de CDNs."));
        return;
      }
      const script = document.createElement("script");
      script.src = cdns[i];
      script.async = true;
      script.onload = () => {
        // @ts-ignore
        const fabric = (window as any).fabric;
        if (fabric) resolve(fabric);
        else reject(new Error("Fabric não disponível após load."));
      };
      script.onerror = () => {
        // tenta próximo CDN
        document.head.removeChild(script);
        loadFrom(i + 1).then(resolve).catch(reject);
      };
      document.head.appendChild(script);
    });
  }

  // @ts-ignore
  (window as any).__fabricLoadingPromise = loadFrom(0);
  // @ts-ignore
  return (window as any).__fabricLoadingPromise;
}

const Editor2D = forwardRef<Editor2DHandle, Props>(function Editor2D(
  {
    tool,
    brushVariant,
    strokeColor,
    fillColor,
    strokeWidth,
    opacity,
    isTrashMode,
    onTrashDelete,
    onHistoryChange,
    onTextFocusRequest,
  },
  ref
) {
  // Atualiza objeto selecionado ao mudar largura/opacidade (e cores)
  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const active = c.getActiveObject?.();
    if (active) {
      let changed = false;
      if (typeof active.set === "function" && active.strokeWidth !== strokeWidth) {
        active.set({ strokeWidth });
        changed = true;
      }
      if (typeof active.set === "function" && active.opacity !== opacity) {
        active.set({ opacity });
        changed = true;
      }
      if (typeof active.set === "function" && active.stroke !== strokeColor) {
        active.set({ stroke: strokeColor });
        changed = true;
      }
      const fillableTypes = ["rect", "ellipse", "triangle", "polygon"];
      if (
        typeof active.set === "function" &&
        active.fill !== fillColor &&
        fillableTypes.includes(active.type)
      ) {
        active.set({ fill: fillColor });
        changed = true;
      }
      if (changed) {
        setTimeout(() => {
          c.setActiveObject(active);
          c.requestRenderAll?.();
        }, 0);
      }
    }
  }, [strokeWidth, opacity, strokeColor, fillColor]);

  // ---- Refs principais ----
  const historyRef = useRef<HistoryManager | null>(null);
  const emitHistory = () => {
    const h = historyRef.current;
    if (!h) return;
    onHistoryChange?.(!!h.canUndo(), !!h.canRedo());
  };
  const isRestoringRef = useRef(false);
  const isLoadingRef = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const domCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const listenersRef = useRef<{ down?: any; move?: any; up?: any }>({});
  const strokeColorRef = useRef(strokeColor);
  React.useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  // NOVO: listeners externos para mudanças de seleção
  const selectionListenersRef = useRef(new Set<(k: "none" | "text" | "other") => void>());

  // ---------------------- Funções públicas auxiliares ----------------------

  const addImage = (
    src: string,
    opts?: { x?: number; y?: number; scale?: number }
  ) => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    if (c && fabric) {
      fabric.Image.fromURL(
        src,
        (img: any) => {
          const x = opts?.x ?? c.getWidth() / 2;
          const y = opts?.y ?? c.getHeight() / 2;

          const scale =
            opts?.scale ??
            Math.min(
              1,
              Math.max(
                0.15,
                Math.min(c.getWidth() / (img.width * 2), c.getHeight() / (img.height * 2))
              )
            );

          img.set({
            left: x - (img.width * scale) / 2,
            top: y - (img.height * scale) / 2,
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
            hasControls: true,
            cornerStyle: "circle",
            transparentCorners: false,
          });
          c.add(img);
          c.setActiveObject(img);
          c.requestRenderAll?.();
        },
        { crossOrigin: "anonymous" }
      );
      return;
    }

    const el = domCanvasRef.current;
    if (el) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = el.getContext("2d");
        if (!ctx) return;
        const scale =
          opts?.scale ??
          Math.min(
            1,
            Math.max(0.15, Math.min(el.width / (img.width * 2), el.height / (img.height * 2)))
          );
        const x = (opts?.x ?? el.width / 2) - (img.width * scale) / 2;
        const y = (opts?.y ?? el.height / 2) - (img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      };
      img.src = src;
    }
  };

  const deleteSelection = () => {
    const c = canvasRef.current;
    if (!c) return;
    const active = c.getActiveObject?.();
    if (active) {
      c.remove(active);
      c.discardActiveObject();
      c.requestRenderAll?.();
    }
  };

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c || !isTrashMode) return;
    const active = c.getActiveObject?.();
    if (active) {
      c.remove(active);
      c.discardActiveObject();
      c.requestRenderAll?.();
      onTrashDelete?.();
    }

    function handleTrashClick(e: any) {
      const target = c.findTarget(e, false);
      if (target) {
        c.remove(target);
        c.requestRenderAll?.();
      }
    }
    if (isTrashMode) {
      c.on("mouse:down", handleTrashClick);
    } else {
      c.off("mouse:down", handleTrashClick);
    }
    return () => {
      c.off("mouse:down", handleTrashClick);
    };
  }, [isTrashMode, onTrashDelete]);

  // ----------------------- helpers fabric -----------------------
  const setHostCursor = (cursor: string) => {
    if (hostRef.current) {
      (hostRef.current.style as any).cursor = cursor;
    }
  };

  const ensureCanvasSize = () => {
    const el = domCanvasRef.current;
    const c = canvasRef.current;
    if (hostRef.current) {
      const w = hostRef.current.clientWidth;
      const h = hostRef.current.clientHeight;
      if (c) {
        if (c.getWidth() !== w || c.getHeight() !== h) {
          c.setWidth(w);
          c.setHeight(h);
          c.renderAll();
        }
      } else if (el) {
        if (el.width !== w || el.height !== h) {
          el.width = w;
          el.height = h;
          const ctx = el.getContext("2d");
          if (ctx) {
            // fundo transparente para herdar a opacidade do painel pai
            ctx.clearRect(0, 0, el.width, el.height);
          }
        }
      }
    }
  };

  const setObjectsSelectable = (c: FabricCanvas, value: boolean) => {
    c.getObjects().forEach((o: any) => {
      o.selectable = value;
      o.evented = value;
    });
  };

  const attachLineListeners = (c: FabricCanvas, down: any, move: any, up: any) => {
    c.on("mouse:down", down);
    c.on("mouse:move", move);
    c.on("mouse:up", up);
    listenersRef.current = { down, move, up };
  };
  const detachLineListeners = (c: FabricCanvas) => {
    const { down, move, up } = listenersRef.current;
    if (down) c.off("mouse:down", down);
    if (move) c.off("mouse:move", move);
    if (up) c.off("mouse:up", up);
    listenersRef.current = {};
  };

  // ---------------------- custom brushes -----------------------
  const ensureSprayBrush = (fabric: any) => {
    if (!fabric.SprayBrushEx) {
      class SprayBrushEx extends fabric.SprayBrush {
        opacity = 1;
        getOpacity() { return this.opacity; }
        setOpacity(o: number) { this.opacity = o; }
        _render() {
          const ctx = this.canvas.contextTop;
          ctx.save();
          ctx.globalAlpha = this.getOpacity();
          // @ts-ignore
          super._render();
          ctx.restore();
        }
      }
      fabric.SprayBrushEx = SprayBrushEx;
    }
    return fabric.SprayBrushEx;
  };

  const ensureMarkerBrush = (fabric: any) => {
    if (!fabric.MarkerBrush) {
      class MarkerBrush extends fabric.PencilBrush {
        opacity = 1;
        getOpacity() { return this.opacity; }
        setOpacity(o: number) { this.opacity = o; }
        _finalizeAndAddPath() {
          const ctx = this.canvas.contextTop;
          ctx.save();
          ctx.globalAlpha = this.getOpacity();
          // @ts-ignore
          super._finalizeAndAddPath();
          ctx.restore();
        }
      }
      fabric.MarkerBrush = MarkerBrush;
    }
    return fabric.MarkerBrush;
  };

  const ensureCalligraphyBrush = (fabric: any) => {
    if (!fabric.CalligraphyBrush) {
      class CalligraphyBrush extends fabric.PencilBrush {
        opacity = 1;
        nibSize = 16;
        nibThin = 0.25;
        nibAngle = 30;
        getOpacity() { return this.opacity; }
        setOpacity(o: number) { this.opacity = o; }
        _render() {
          const ctx = this.canvas.contextTop;
          ctx.save();
          ctx.globalAlpha = this.getOpacity();
          ctx.rotate((this.nibAngle * Math.PI) / 180);
          // @ts-ignore
          super._render();
          ctx.restore();
        }
      }
      fabric.CalligraphyBrush = CalligraphyBrush;
    }
    return fabric.CalligraphyBrush;
  };

  const createBrush = (
    c: FabricCanvas,
    variant: BrushVariant,
    color: string,
    width: number,
    alpha: number
  ) => {
    const fabric = fabricRef.current;
    if (!fabric) return null;

    let brush: any = new fabric.PencilBrush(c);
    brush.color = withAlpha(color, alpha);
    brush.width = width;

    if (variant === "spray") {
      const Spray = ensureSprayBrush(fabric);
      const sb: any = new Spray(c);
      sb.width = Math.max(8, width * 1.6);
      sb.color = withAlpha(color, alpha);
      sb.opacity = 1;
      return sb;
    }

    if (variant === "marker") {
      const Marker = ensureMarkerBrush(fabric);
      const pb: any = new Marker(c);
      pb.width = Math.max(4, width * 1.2);
      pb.color = withAlpha(color, alpha);
      pb.opacity = 1;
      return pb;
    }

    if (variant === "calligraphy") {
      const Stamp = ensureCalligraphyBrush(fabric);
      const cb: any = new Stamp(c);
      cb.opacity = alpha;
      cb.color = withAlpha(color, alpha);
      cb.nibSize = Math.max(8, width * 2.2);
      cb.nibThin = 0.22;
      cb.nibAngle = 35;
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
        c.setBackgroundColor("transparent", () => c.renderAll());

        canvasRef.current = c;
        domCanvasRef.current = el;

        // ------ Histórico (Undo/Redo) ------
        historyRef.current = new HistoryManager({
          limit: 50,
          snapshot: () => toJSON(),
          restore: async (snap: string) => {
            isRestoringRef.current = true;
            try {
              await loadFromJSON(snap);
            } finally {
              isRestoringRef.current = false;
            }
            emitHistory();
          },
        });
        historyRef.current.captureInitial();
        emitHistory();

        const __onAdded = () => {
          if (!isRestoringRef.current && !isLoadingRef.current)
            historyRef.current?.push("add");
          emitHistory();
        };
        const __onRemoved = () => {
          if (!isRestoringRef.current && !isLoadingRef.current)
            historyRef.current?.push("remove");
          emitHistory();
        };
        const __onModified = () => {
          if (!isRestoringRef.current && !isLoadingRef.current)
            historyRef.current?.push("modify");
          emitHistory();
        };
        const __onPath = () => {
          if (!isRestoringRef.current && !isLoadingRef.current)
            historyRef.current?.push("draw");
          emitHistory();
        };
        c.on("object:added", __onAdded);
        c.on("object:removed", __onRemoved);
        c.on("object:modified", __onModified);
        c.on("path:created", __onPath);

        // ======= Publicação do estilo ativo + seleção =======
        const emitSelectionKind = () => {
          const active = c.getActiveObject?.();
          const kind: "none" | "text" | "other" = !active
            ? "none"
            : (String(active.type || "").toLowerCase().includes("text") ? "text" : "other");

          // Painel externo (Creation.tsx / TextToolbar)
          selectionListenersRef.current.forEach((fn) => fn(kind));

          // Compat: autoabrir UI de texto (se aplicável)
          if (kind === "text") onTextFocusRequest?.();
        };

        const notifyActiveTextStyle = () => {
          // usa o getter global definido abaixo
          const style = (window as any).__editor2d_getActiveTextStyle?.() || {};
          try {
            window.dispatchEvent(new CustomEvent("editor2d:activeTextStyle", { detail: style }));
            window.dispatchEvent(new CustomEvent("editor2d:selectionStyle",   { detail: style }));
            window.dispatchEvent(new CustomEvent("editor2d:selectionChange",  { detail: style }));
          } catch {}
        };

        // expõe getter global para outras UIs
        (window as any).__editor2d_getActiveTextStyle = () => {
          const active = c.getActiveObject?.();
          if (!active || !String(active.type || "").toLowerCase().includes("text")) return {};
          const shadowObj = (active as any).shadow;
          let shadow: TextStyle["shadow"] = null;
          if (shadowObj && typeof shadowObj !== "string") {
            shadow = {
              color: shadowObj.color,
              blur: shadowObj.blur,
              offsetX: shadowObj.offsetX,
              offsetY: shadowObj.offsetY,
            };
          }
          return {
            fontFamily: active.fontFamily || "",
            fontSize: active.fontSize,
            fontWeight: active.fontWeight,
            fontStyle: active.fontStyle,
            underline: !!active.underline,
            linethrough: !!active.linethrough,
            fill: active.fill,
            stroke: active.stroke,
            strokeWidth: active.strokeWidth,
            textAlign: active.textAlign,
            lineHeight: active.lineHeight,
            charSpacing: active.charSpacing,
            shadow,
          } as TextStyle;
        };

        // Eventos que disparam atualização do estilo/seleção
        const onSel = () => { emitSelectionKind(); notifyActiveTextStyle(); };
        c.on("selection:created", onSel);
        c.on("selection:updated", onSel);
        c.on("selection:cleared", onSel);
        c.on("text:changed", notifyActiveTextStyle);

        // Ping externo para publicar o estado atual
        const onRequest = () => notifyActiveTextStyle();
        window.addEventListener("editor2d:requestActiveTextStyle", onRequest);

        // Resize responsivo
        roRef.current = new ResizeObserver(() => ensureCanvasSize());
        roRef.current.observe(hostRef.current);

        // Cleanup dos listeners extras
        const cleanupPublishers = () => {
          c.off("selection:created", onSel);
          c.off("selection:updated", onSel);
          c.off("selection:cleared", onSel);
          c.off("text:changed", notifyActiveTextStyle);
          window.removeEventListener("editor2d:requestActiveTextStyle", onRequest);
        };
        // guarda para usar no unmount
        (cleanupRef as any).current = cleanupPublishers;

      } catch {
        // Fallback 2D (sem fabric)
        if (!hostRef.current) return;
        const el = document.createElement("canvas");
        el.style.width = "100%";
        el.style.height = "100%";
        el.width = hostRef.current.clientWidth;
        el.height = hostRef.current.clientHeight;
        hostRef.current.appendChild(el);
        domCanvasRef.current = el;
        canvasRef.current = null;

        // mesmo sem fabric, ainda expõe getter vazio
        (window as any).__editor2d_getActiveTextStyle = () => ({});
      }
    };

    const cleanupRef = { current: (() => {}) as any };
    init();

    return () => {
      // cleanup
      const c = canvasRef.current;
      if (c) {
        c.off("object:added");
        c.off("object:removed");
        c.off("object:modified");
        c.off("path:created");
      }
      try { (cleanupRef as any).current?.(); } catch {}

      try {
        if (c) {
          detachLineListeners(c);
          c.dispose?.();
        }
        const el = domCanvasRef.current;
        if (el && el.parentElement) {
          el.parentElement.removeChild(el);
        }
      } catch {}
      roRef.current?.disconnect();
      roRef.current = null;
      canvasRef.current = null;
      domCanvasRef.current = null;
      fabricRef.current = null;
    };
  }, [onTextFocusRequest]);

  // NOVO: escuta o evento global para inserir texto centralizado (sem mexer na Creation.tsx)
  useEffect(() => {
    const handler = async () => {
      const c: any = canvasRef.current as any;
      const fabricLocal: any = fabricRef.current as any;
      if (!c || !fabricLocal) return;

      // garante Inter com variações básicas antes de criar IText
      try {
        await ensureFontForFabric("Inter", "google", {
          weights: [400, 700],
          styles: ["normal", "italic"],
        });
      } catch {} // não bloquear UI

      const center = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
      const it = new fabricLocal.IText("Digite aqui", {
        left: center.x,
        top: center.y,
        originX: "center",
        originY: "center",
        fontFamily: "Inter",
        fontSize: 32,
        fill: strokeColorRef.current || "#000000",
        objectCaching: true,
        editable: true,
      });
      c.add(it);
      c.setActiveObject(it);
      it.enterEditing?.();
      it.selectAll?.();
      c.requestRenderAll?.();
      try {
        const detail = (window as any).__editor2d_getActiveTextStyle?.() || {};
        window.dispatchEvent(new CustomEvent("editor2d:activeTextStyle", { detail }));
      } catch {}
    };
    window.addEventListener("editor2d:addCenteredText", handler);
    return () => window.removeEventListener("editor2d:addCenteredText", handler);
  }, []); // usa strokeColorRef internamente para cor atual

  // ----------------------- modo ferramenta -----------------------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) {
      setHostCursor("default");
      return;
    }
    const fabric = fabricRef.current;
    if (!fabric) return;

    // reset handlers
    detachLineListeners(c);

    // SELECT
    if (tool === "select") {
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      setHostCursor("default");
      c.discardActiveObject();
      c.renderAll();
      return;
    }

    // TEXT (⚠️ sem criação por clique — funciona como select)
    if (tool === "text") {
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      setHostCursor("default"); // opcionalmente "text"
      c.discardActiveObject();
      c.renderAll();
      return;
    }

    // BRUSH/CURVE
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

    // LINE
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
            selectable: false,
            evented: false,
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
        if (!currentLine) return;
        currentLine.set({ selectable: true, evented: true });
        c.setActiveObject(currentLine);
        currentLine = null;
        c.renderAll();
      };

      attachLineListeners(c, onDown, onMove, onUp);
      setHostCursor("crosshair");
      return;
    }
  }, [tool, brushVariant, strokeColor, fillColor, strokeWidth, opacity]);

  // ----------------------- addShape -----------------------
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
          rx: 8,
          ry: 8,
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
        const cx = 200, cy = 140, r = 70, sides = 6;
        const pts = Array.from({ length: sides }, (_, i) => {
          const a = (i / sides) * Math.PI * 2;
          return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
        });
        obj = new fabric.Polygon(pts, { ...s, left: cx - r, top: cy - r });
      }

      if (obj) {
        obj.selectable = true;
        obj.evented = true;
        obj.set({ opacity });
        c.add(obj);
        c.setActiveObject(obj);
        c.renderAll();
      }
      return;
    }

    const el = domCanvasRef.current;
    if (el) {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const s2 = {
        strokeStyle: s.stroke,
        fillStyle: s.fill,
        lineWidth: s.strokeWidth ?? 2,
        globalAlpha: s.opacity ?? 1,
      } as any;

      ctx.save();
      Object.assign(ctx, s2);
      ctx.beginPath();
      if (shape === "rect") {
        ctx.rect(80, 60, 180, 120);
      } else if (shape === "triangle") {
        ctx.moveTo(120, 60);
        ctx.lineTo(260, 200);
        ctx.lineTo(40, 200);
        ctx.closePath();
      } else if (shape === "ellipse") {
        ctx.ellipse(200, 140, 90, 60, 0, 0, Math.PI * 2);
      } else if (shape === "polygon") {
        const cx = 200, cy = 140, r = 70, sides = 6;
        ctx.moveTo(cx + Math.cos(0) * r, cy + Math.sin(0) * r);
        for (let i = 1; i <= sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
      }
      if (s2.fillStyle) ctx.fill();
      if (s2.strokeStyle) ctx.stroke();
      ctx.restore();
    }
  };

  // ----------------------- export/serialize -----------------------
  const exportPNG = () => {
    const c = canvasRef.current;
    if (c) {
      return c.toDataURL({
        format: "png",
        quality: 1,
        multiplier: 2,
        enableRetinaScaling: true,
        withoutTransform: false,
      });
    }
    const el = domCanvasRef.current;
    return el?.toDataURL("image/png") || "";
  };

  const toJSON = () => {
    const c = canvasRef.current;
    if (c) {
      const data = c.toJSON(["selectable", "evented"]);
      return JSON.stringify({ kind: "fabric", data });
    }
    const el = domCanvasRef.current;
    if (el) {
      return JSON.stringify({ kind: "dom2d", data: el.toDataURL("image/png") });
    }
    return JSON.stringify({ kind: "empty" });
  };

  const loadFromJSON = async (json: string) => {
    const c = canvasRef.current;
    if (!c) return;
    let parsed: any = null;
    try {
      parsed = JSON.parse(json);
    } catch {}
    if (parsed?.kind === "fabric" && c?.loadFromJSON) {
      isLoadingRef.current = true;
      return new Promise<void>((resolve) => {
        c.loadFromJSON(parsed.data, () => {
          c.renderAll();
          isLoadingRef.current = false;
          resolve();
        });
      });
    }
    if (parsed?.kind === "dom2d" && domCanvasRef.current) {
      const el = domCanvasRef.current;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      await new Promise<void>((res) => {
        img.onload = () => {
          ctx.clearRect(0, 0, el.width, el.height);
          ctx.drawImage(img, 0, 0, el.width, el.height);
          res();
        };
        img.src = parsed.data;
      });
      return;
    }
  };

  // ----------------------- ações públicas -----------------------
  const clear = () => {
    const c = canvasRef.current;
    if (c) {
      c.clear();
      // mantém transparente para seguir o “glass” do container
      c.setBackgroundColor("transparent", () => c.renderAll());
      historyRef.current?.push("clear");
      emitHistory();
      return;
    }
    const el = domCanvasRef.current;
    if (el) {
      const ctx = el.getContext("2d");
      if (ctx) {
        // apenas limpa — mantém transparente
        ctx.clearRect(0, 0, el.width, el.height);
      }
    }
  };

  // ==== Texto: criação ====
  const addText = (value: string = "Digite aqui", opts?: { x?: number; y?: number }) => {
    const c: any = canvasRef.current as any;
    const fabricLocal: any = fabricRef.current as any;
    if (!c || !fabricLocal) return;
    const center = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
    const it = new fabricLocal.IText(value, {
      left: typeof opts?.x === "number" ? opts.x : center.x,
      top: typeof opts?.y === "number" ? opts.y : center.y,
      originX: "center",
      originY: "center",
      fontFamily: "Inter",
      fontSize: 32,
      fill: strokeColorRef.current || "#000000",
      objectCaching: true,
      editable: true,
    });
    c.add(it);
    c.setActiveObject(it);
    it.enterEditing?.();
    it.selectAll?.();
    c.requestRenderAll?.();
    // histórico: rely em "object:added"
    try {
      const detail = (window as any).__editor2d_getActiveTextStyle?.() || {};
      window.dispatchEvent(new CustomEvent("editor2d:activeTextStyle", { detail }));
    } catch {}
  };

  // ==== Texto: leitura do estilo ====
  const getActiveTextStyle = (): TextStyle | null => {
    const c: any = canvasRef.current as any;
    if (!c) return null;
    const active: any = c.getActiveObject && c.getActiveObject();
    if (!active || !String(active.type || "").toLowerCase().includes("text")) return null;

    const shadowObj = active.shadow;
    let shadow: TextStyle["shadow"] = null;
    if (shadowObj) {
      const s = typeof shadowObj === "string" ? null : shadowObj;
      if (s) {
        shadow = {
          color: s.color,
          blur: s.blur,
          offsetX: s.offsetX,
          offsetY: s.offsetY,
        };
      }
    }

    return {
      fontFamily: active.fontFamily,
      fontSize: active.fontSize,
      fontWeight: active.fontWeight,
      fontStyle: active.fontStyle,
      underline: !!active.underline,
      linethrough: !!active.linethrough,
      fill: active.fill,
      stroke: active.stroke,
      strokeWidth: active.strokeWidth,
      textAlign: active.textAlign,
      lineHeight: active.lineHeight,
      charSpacing: active.charSpacing,
      shadow,
    };
  };

  // ==== Texto: aplicação de estilo (com carregamento de fonte seguro + preservação de fontFamily) ====
  const setActiveTextStyle = async (patch: TextStyle & { from?: "font-picker" | "inspector" }) => {
    const c: any = canvasRef.current as any;
    const fabricLocal: any = fabricRef.current as any;
    if (!c) return;
    const active: any = c.getActiveObject && c.getActiveObject();
    if (!active || !String(active.type || "").toLowerCase().includes("text")) return;

    // Carrega a família se necessário, porém sem bloquear a UI se falhar
    const nextPatch: any = { ...patch };

    // Preserva a família atual se patch não trouxer outra (evita “voltar” para padrão)
    if (nextPatch.fontFamily == null) {
      nextPatch.fontFamily = active.fontFamily || "Inter";
    }

    if (nextPatch.fontFamily) {
      ensureFontForFabric(nextPatch.fontFamily)
        .catch(() => {})
        .then(() => c.requestRenderAll?.());
    }

    // Shadow requer instância de fabric.Shadow ou string
    if ("shadow" in nextPatch) {
      const sh = nextPatch.shadow;
      if (!sh) {
        nextPatch.shadow = null;
      } else {
        if (fabricLocal?.Shadow) {
          nextPatch.shadow = new fabricLocal.Shadow({
            color: sh.color,
            blur: sh.blur,
            offsetX: sh.offsetX,
            offsetY: sh.offsetY,
          });
        } else {
          nextPatch.shadow = `${sh.color} ${sh.offsetX || 0}px ${sh.offsetY || 0}px ${sh.blur || 0}px`;
        }
      }
    }

    // Contorno limpo (stroke primeiro) quando houver stroke válido
    const widthCandidate = nextPatch.strokeWidth ?? active.strokeWidth ?? 0;
    const colorCandidate = nextPatch.stroke ?? active.stroke;
    const hasStroke = !!colorCandidate && Number(widthCandidate) > 0;
    if (hasStroke) {
      nextPatch.paintFirst = "stroke";
      nextPatch.strokeUniform = true;
      nextPatch.strokeLineJoin = "round";
    } else {
      nextPatch.paintFirst = "fill";
    }

    active.set(nextPatch);
    active.setCoords?.();
    c.requestRenderAll?.();

    if (!isRestoringRef.current && !isLoadingRef.current) {
      historyRef.current?.push("modify");
      emitHistory();
    }

    // Notifica a UI (Sidebar/FontPicker) para realçar a fonte correta
    try {
      const detail = (window as any).__editor2d_getActiveTextStyle?.() || {};
      window.dispatchEvent(new CustomEvent("editor2d:activeTextStyle", { detail }));
      window.dispatchEvent(new CustomEvent("editor2d:selectionStyle",   { detail }));
      window.dispatchEvent(new CustomEvent("editor2d:selectionChange",  { detail }));
    } catch {}
  };

  // Retrocompat: mantém applyTextStyle, mas delega para setActiveTextStyle
  const applyTextStyle = (patch: TextStyle) => {
    void setActiveTextStyle(patch);
  };

  useImperativeHandle(ref, () => ({
    clear,
    exportPNG,
    addShape,
    addImage,
    toJSON,
    loadFromJSON,
    deleteSelection,
    // ---- histórico exposto ----
    undo: async () => {
      await historyRef.current?.undo();
      emitHistory();
    },
    redo: async () => {
      await historyRef.current?.redo();
      emitHistory();
    },
    canUndo: () => !!historyRef.current?.canUndo(),
    canRedo: () => !!historyRef.current?.canRedo(),
    historyCapture: () => {
      historyRef.current?.push("manual");
      emitHistory();
    },
    // Texto
    addText,
    getActiveTextStyle,
    setActiveTextStyle,
    applyTextStyle,
    // Seleção
    onSelectionChange: (cb) => {
      selectionListenersRef.current.add(cb);
    },
  }));

  // ------ Atalhos de teclado (Undo/Redo) ------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as any).isContentEditable)
      )
        return;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === "z" && !shift) {
        e.preventDefault();
        historyRef.current?.undo();
        emitHistory();
      } else if (ctrl && (k === "y" || (k === "z" && shift))) {
        e.preventDefault();
        historyRef.current?.redo();
        emitHistory();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={hostRef}
      className="w-full h-full"
      style={{ background: "transparent", touchAction: "none" }}
    />
  );
});

export default Editor2D;
