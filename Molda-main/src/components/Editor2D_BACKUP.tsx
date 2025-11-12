// src/components/Editor2D.tsx
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
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
  getActiveTextStyle: () => TextStyle | null;
  setActiveTextStyle: (patch: TextStyle & { from?: "font-picker" | "inspector" }) => Promise<void>;
  applyTextStyle: (patch: TextStyle) => void;
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
  onTextFocusRequest?: () => void;
};

type FabricCanvas = any;

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

// Loader simplificado do Fabric
function loadFabricRuntime(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).fabric) {
    return Promise.resolve((window as any).fabric);
  }
  if ((window as any).__fabricLoadingPromise) {
    return (window as any).__fabricLoadingPromise;
  }

  const cdns = [
    "https://unpkg.com/fabric@5.3.0/dist/fabric.min.js",
    "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js",
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
        const fabric = (window as any).fabric;
        if (fabric) resolve(fabric);
        else reject(new Error("Fabric não disponível após load."));
      };
      script.onerror = () => {
        document.head.removeChild(script);
        loadFrom(i + 1).then(resolve).catch(reject);
      };
      document.head.appendChild(script);
    });
  }

  (window as any).__fabricLoadingPromise = loadFrom(0);
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
  const strokeColorRef = useRef(strokeColor);
  const selectionListenersRef = useRef(new Set<(k: "none" | "text" | "other") => void>());

  React.useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  const toJSON = () => {
    const c = canvasRef.current;
    if (c) {
      const data = c.toJSON(["selectable", "evented"]);
      return JSON.stringify({ kind: "fabric", data });
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
  };

  const clear = () => {
    const c = canvasRef.current;
    if (c) {
      c.clear();
      c.setBackgroundColor("transparent", () => c.renderAll());
      historyRef.current?.push("clear");
      emitHistory();
    }
  };

  const exportPNG = () => {
    const c = canvasRef.current;
    if (c) {
      return c.toDataURL({
        format: "png",
        quality: 1,
        multiplier: 2,
      });
    }
    return "";
  };

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
  };

  const getActiveTextStyle = (): TextStyle | null => {
    const c: any = canvasRef.current as any;
    if (!c) return null;
    const active: any = c.getActiveObject && c.getActiveObject();
    if (!active || !String(active.type || "").toLowerCase().includes("text")) return null;

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
      shadow: null,
    };
  };

  const setActiveTextStyle = async (patch: TextStyle & { from?: "font-picker" | "inspector" }) => {
    const c: any = canvasRef.current as any;
    if (!c) return;
    const active: any = c.getActiveObject && c.getActiveObject();
    if (!active || !String(active.type || "").toLowerCase().includes("text")) return;

    const nextPatch: any = { ...patch };
    if (nextPatch.fontFamily == null) {
      nextPatch.fontFamily = active.fontFamily || "Inter";
    }

    active.set(nextPatch);
    active.setCoords?.();
    c.requestRenderAll?.();

    if (!isRestoringRef.current && !isLoadingRef.current) {
      historyRef.current?.push("modify");
      emitHistory();
    }
  };

  const applyTextStyle = (patch: TextStyle) => {
    void setActiveTextStyle(patch);
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

  const addShape = (shape: ShapeKind) => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    if (!c || !fabric) return;

    let obj: any = null;
    if (shape === "rect") {
      obj = new fabric.Rect({
        left: 80,
        top: 60,
        width: 180,
        height: 120,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth,
      });
    }

    if (obj) {
      c.add(obj);
      c.setActiveObject(obj);
      c.renderAll();
    }
  };

  const addImage = (src: string, opts?: { x?: number; y?: number; scale?: number }) => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    if (c && fabric) {
      fabric.Image.fromURL(
        src,
        (img: any) => {
          const x = opts?.x ?? c.getWidth() / 2;
          const y = opts?.y ?? c.getHeight() / 2;
          const scale = opts?.scale ?? 0.5;

          img.set({
            left: x - (img.width * scale) / 2,
            top: y - (img.height * scale) / 2,
            scaleX: scale,
            scaleY: scale,
          });
          c.add(img);
          c.setActiveObject(img);
          c.requestRenderAll?.();
        },
        { crossOrigin: "anonymous" }
      );
    }
  };

  useImperativeHandle(ref, () => ({
    clear,
    exportPNG,
    addShape,
    addImage,
    toJSON,
    loadFromJSON,
    deleteSelection,
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
      if (isRestoringRef.current || isLoadingRef.current) return;
      historyRef.current?.push("manual");
      emitHistory();
    },
    addText,
    getActiveTextStyle,
    setActiveTextStyle,
    applyTextStyle,
    onSelectionChange: (cb) => {
      selectionListenersRef.current.add(cb);
    },
  }));

  // Inicialização principal
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

        // Eventos simples do histórico
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

      } catch (err) {
        console.error("[Editor2D] init: erro", err);
      }
    };

    init();

    return () => {
      disposed = true;
      const c = canvasRef.current;
      if (c) {
        c.off("object:added");
        c.off("object:removed");
        c.off("object:modified");
        c.off("path:created");
        c.dispose?.();
      }
      roRef.current?.disconnect();
    };
  }, []);

  // Atalhos de teclado para undo/redo
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