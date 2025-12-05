// src/components/Editor2D.tsx
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import HistoryManager from "../lib/HistoryManager";
import { installFabricEraser } from "../lib/fabricEraser";

// Tipos alinhados com ExpandableSidebar
export type Tool = "select" | "brush" | "line" | "curve" | "text";
export type BrushVariant = "pencil" | "spray" | "marker" | "calligraphy" | "eraser";
export type ShapeKind = "rect" | "triangle" | "ellipse" | "polygon";

type LinePoint = { x: number; y: number };
type LineMeta = {
  version: 1;
  points: LinePoint[];
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

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

/** Informações sobre a seleção atual para context menu */
export type SelectionInfo = {
  hasSelection: boolean;
  hasClipboard: boolean;
  isFullyLocked: boolean;
  canBringForward: boolean;
  canSendBackward: boolean;
  canBringToFront: boolean;
  canSendToBack: boolean;
  canGroup: boolean;
};

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

  // ==== Context Menu Functions ====
  getSelectionInfo: () => SelectionInfo | null;
  copySelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  toggleLockSelection: () => void;
  bringSelectionForward: () => void;
  sendSelectionBackward: () => void;
  bringSelectionToFront: () => void;
  sendSelectionToBack: () => void;
  groupSelection: () => void;
  refresh: () => void;
  listUsedFonts: () => string[];
  waitForIdle: () => Promise<void>;
};

type Props = {
  tool: Tool;
  brushVariant: BrushVariant;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
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

async function reviveCanvasErasers(canvas: any, fabricLib: any) {
  if (!canvas || !fabricLib?.Eraser) return;

  const makeEraser = (raw: any) => {
    if (!raw) return null;
    if (raw.isType && raw.isType("eraser")) return Promise.resolve(raw);
    if (raw.type === "eraser" && (raw.objects || raw._objects)) {
      return fabricLib.Eraser.fromObject(raw);
    }
    if (raw.type === "eraser" && typeof raw.clone === "function") {
      return Promise.resolve(raw);
    }
    return null;
  };

  const tasks: Promise<any>[] = [];

  const visit = (obj: any) => {
    if (!obj) return;
    if (obj.eraser && !(obj.eraser.isType && obj.eraser.isType("eraser"))) {
      const maybe = makeEraser(obj.eraser);
      if (maybe && typeof maybe.then === "function") {
        tasks.push(
          maybe.then((eraser: any) => {
            if (eraser) {
              obj.eraser = eraser;
              if (typeof eraser.shouldCache !== "function") {
                delete eraser.shouldCache;
              }
              obj.dirty = true;
            }
          })
        );
      } else if (maybe) {
        obj.eraser = maybe;
        if (typeof maybe.shouldCache !== "function") {
          delete maybe.shouldCache;
        }
        obj.dirty = true;
      }
    }
    if (obj.eraser && typeof obj.eraser.shouldCache !== "function") {
      delete obj.eraser.shouldCache;
      obj.dirty = true;
    }
    if (typeof obj.forEachObject === "function") {
      obj.forEachObject((child: any) => visit(child));
    } else if (Array.isArray(obj._objects)) {
      obj._objects.forEach((child: any) => visit(child));
    }
  };

  canvas.getObjects().forEach(visit);
  visit(canvas.backgroundImage);
  visit(canvas.overlayImage);

  if (tasks.length) {
    await Promise.all(tasks);
  }
  try {
    canvas.requestRenderAll?.();
  } catch {}
}

// ---- Loader em runtime do Fabric (sem import local) ----
function loadFabricRuntime(): Promise<any> {
  // Verifica se Fabric já está disponível e completamente carregado
  if (typeof window !== "undefined" && (window as any).fabric && (window as any).fabric.Canvas) {
    console.log("[Editor2D] Fabric already loaded, returning");
    return Promise.resolve((window as any).fabric);
  }
  
  if ((window as any).__fabricLoadingPromise) {
    console.log("[Editor2D] Fabric loading in progress, waiting");
    return (window as any).__fabricLoadingPromise;
  }

  console.log("[Editor2D] Starting Fabric load");
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
      
      console.log(`[Editor2D] Trying CDN ${i}: ${cdns[i]}`);
      const script = document.createElement("script");
      script.src = cdns[i];
      script.async = true;
      
      script.onload = () => {
        console.log(`[Editor2D] Script loaded from CDN ${i}`);
        
        // Aguarda Fabric estar completamente disponível
        const checkFabric = () => {
          const fabric = (window as any).fabric;
          if (fabric && fabric.Canvas) {
            console.log("[Editor2D] Fabric.Canvas confirmed available");
            resolve(fabric);
          } else {
            console.log("[Editor2D] Fabric not ready, checking again in 50ms");
            setTimeout(checkFabric, 50);
          }
        };
        
        setTimeout(checkFabric, 10);
      };
      
      script.onerror = () => {
        console.log(`[Editor2D] Failed to load from CDN ${i}, trying next`);
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
  const brushMetaRef = useRef({
    variant: brushVariant,
    width: strokeWidth,
    opacity,
  });
  const toolRef = useRef(tool);
  const selectionListenersRef = useRef(new Set<(k: "none" | "text" | "other") => void>());
  const erasingCountRef = useRef(0);
  const idleResolversRef = useRef<Set<() => void>>(new Set());
  const historyGuardRef = useRef(0);
  const lineTransformGuardRef = useRef(0);

  const runSilently = (cb: () => void) => {
    historyGuardRef.current += 1;
    try {
      cb();
    } finally {
      historyGuardRef.current = Math.max(0, historyGuardRef.current - 1);
    }
  };

  const runWithLineTransformGuard = (cb: () => void) => {
    lineTransformGuardRef.current += 1;
    try {
      cb();
    } finally {
      lineTransformGuardRef.current = Math.max(
        0,
        lineTransformGuardRef.current - 1
      );
    }
  };

  const shouldRecordHistory = () =>
    !isRestoringRef.current && !isLoadingRef.current && historyGuardRef.current === 0;

  const isBusy = () =>
    isLoadingRef.current || isRestoringRef.current || erasingCountRef.current > 0;

  const flushIdleResolvers = () => {
    if (isBusy() || idleResolversRef.current.size === 0) {
      return;
    }
    const pending = Array.from(idleResolversRef.current);
    idleResolversRef.current.clear();
    pending.forEach((resolver) => resolver());
  };

  const waitForIdle = React.useCallback((): Promise<void> => {
    if (!isBusy()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const wrapped = () => {
        idleResolversRef.current.delete(wrapped);
        resolve();
      };
      idleResolversRef.current.add(wrapped);
    });
  }, []);
  
  // Refs para controle de ferramentas
  const listenersRef = useRef<{ down?: any; move?: any; up?: any; dbl?: any; keydown?: any }>({});
  const [canvasReady, setCanvasReady] = useState(false);

  React.useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  React.useEffect(() => {
    brushMetaRef.current = {
      variant: brushVariant,
      width: strokeWidth,
      opacity,
    };
  }, [brushVariant, strokeWidth, opacity]);

  React.useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const toJSON = () => {
    const c = canvasRef.current;
    if (c) {
      const data = c.toJSON(["selectable", "evented", "erasable", "eraser", "__lineMeta"]);
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
      return new Promise<void>((resolve, reject) => {
        const prevRenderOnAddRemove = c.renderOnAddRemove;
        c.renderOnAddRemove = false;
        try {
          c.loadFromJSON(parsed.data, async () => {
            try {
              await reviveCanvasErasers(c, fabricRef.current);
              restoreLineObjects(c);
              setObjectsSelectable(c, true);
              c.renderAll();
              resolve();
            } catch (callbackErr) {
              reject(callbackErr);
            } finally {
              c.renderOnAddRemove = prevRenderOnAddRemove;
              isLoadingRef.current = false;
              flushIdleResolvers();
            }
          });
        } catch (err) {
          c.renderOnAddRemove = prevRenderOnAddRemove;
          isLoadingRef.current = false;
          flushIdleResolvers();
          reject(err);
        }
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
      erasable: true,
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

    const isIText = typeof active?.setSelectionStyles === "function";
    const selStart: number | null = isIText && typeof active.selectionStart === "number" ? active.selectionStart : null;
    const selEnd: number | null = isIText && typeof active.selectionEnd === "number" ? active.selectionEnd : null;
    const hasRange = isIText && selStart !== null && selEnd !== null && selStart !== selEnd;

    const perCharKeys = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "fill",
      "stroke",
      "strokeWidth",
      "charSpacing",
      "underline",
      "linethrough",
    ];
    const blockKeys = ["textAlign", "lineHeight", "shadow"];

    if (hasRange) {
      const charPatch: any = {};
      perCharKeys.forEach((k) => {
        if (nextPatch[k] !== undefined) charPatch[k] = nextPatch[k];
      });
      try {
        active.setSelectionStyles(charPatch);
      } catch {}
      const wholePatch: any = {};
      blockKeys.forEach((k) => {
        if (nextPatch[k] !== undefined) wholePatch[k] = nextPatch[k];
      });
      if (Object.keys(wholePatch).length) {
        try { active.set(wholePatch); } catch {}
      }
    } else {
      try { active.set(nextPatch); } catch {}
    }

    try { active.setCoords?.(); } catch {}
    try { c.requestRenderAll?.(); } catch {}

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

  // ----------------------- helpers fabric -----------------------
  const setHostCursor = (cursor: string) => {
    if (hostRef.current) {
      (hostRef.current.style as any).cursor = cursor;
    }
  };

  const ensureCanvasReady = async () => {
    const c = canvasRef.current as any;
    const fabric = fabricRef.current as any;
    const host = hostRef.current as any;
    if (!c || !fabric || !host) return;
    const lower: HTMLCanvasElement | null = c.lowerCanvasEl ?? null;
    const upper: HTMLCanvasElement | null = c.upperCanvasEl ?? null;
    const lc: CanvasRenderingContext2D | null = lower ? lower.getContext("2d") : null;
    const uc: CanvasRenderingContext2D | null = upper ? upper.getContext("2d") : null;
    if (lc && uc) return;
    const snap = toJSON();
    try { c.dispose?.(); } catch {}
    try {
      while (host.firstChild) host.removeChild(host.firstChild);
    } catch {}
    const el = document.createElement("canvas");
    el.style.width = "100%";
    el.style.height = "100%";
    el.width = host.clientWidth || 1;
    el.height = host.clientHeight || 1;
    host.appendChild(el);
    try {
      const nc = new fabric.Canvas(el, { selection: true, preserveObjectStacking: true });
      nc.renderOnAddRemove = true;
      nc.setBackgroundColor("transparent", () => nc.renderAll());
      canvasRef.current = nc;
      domCanvasRef.current = el;
      if (snap) {
        await loadFromJSON(snap);
      }
    } catch {}
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
          if (el && ctx && typeof ctx.clearRect === "function") {
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

  const attachLineListeners = (
    c: FabricCanvas,
    handlers: { down?: any; move?: any; up?: any; dbl?: any; keydown?: (event: KeyboardEvent) => void }
  ) => {
    const { down, move, up, dbl, keydown } = handlers;
    if (down) c.on("mouse:down", down);
    if (move) c.on("mouse:move", move);
    if (up) c.on("mouse:up", up);
    if (dbl) c.on("mouse:dblclick", dbl);
    if (keydown) window.addEventListener("keydown", keydown);
    listenersRef.current = handlers;
  };
  
  const detachLineListeners = (c: FabricCanvas) => {
    const { down, move, up, dbl, keydown } = listenersRef.current;
    if (down) c.off("mouse:down", down);
    if (move) c.off("mouse:move", move);
    if (up) c.off("mouse:up", up);
    if (dbl) c.off("mouse:dblclick", dbl);
    if (keydown) window.removeEventListener("keydown", keydown);
    listenersRef.current = {};
  };

  // ---------------------- custom brushes -----------------------
  const ensureSprayBrush = (fabric: any) => {
    if (!fabric.SprayBrushEx) {
      const uniqueRects = (rects: any[]) => {
        const seen = new Set<string>();
        const out: any[] = [];
        rects.forEach((rect) => {
          const key = `${Math.round(rect.left)}|${Math.round(rect.top)}|${Math.round(rect.width)}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(rect);
          }
        });
        return out;
      };

      class SprayBrushEx extends fabric.SprayBrush {
        lastPointer: { x: number; y: number } | null = null;
        minDistance = 2;
        colorCache: number[] | null = null;
        colorCacheKey: string | null = null;

        setMinDistance(distance: number) {
          this.minDistance = Math.max(0, distance || 0);
        }

        rememberPointer(pointer: { x: number; y: number } | null) {
          this.lastPointer = pointer ? { x: pointer.x, y: pointer.y } : null;
        }

        shouldAddChunk(pointer: { x: number; y: number }) {
          if (!pointer || !this.lastPointer) return true;
          const dx = pointer.x - this.lastPointer.x;
          const dy = pointer.y - this.lastPointer.y;
          return Math.hypot(dx, dy) >= this.minDistance;
        }

        ensureColorSource() {
          if (this.colorCacheKey === this.color && this.colorCache) {
            return this.colorCache;
          }
          try {
            const parsed = new fabric.Color(this.color);
            this.colorCache = parsed.getSource() || [0, 0, 0, 1];
          } catch {
            this.colorCache = [0, 0, 0, 1];
          }
          this.colorCacheKey = this.color;
          return this.colorCache;
        }

        composeFill(pointOpacity: number) {
          const source = this.ensureColorSource() ?? [0, 0, 0, 1];
          const [r, g, b, a = 1] = source;
          const finalOpacity = Math.max(0, Math.min(1, (pointOpacity ?? 1) * a));
          return `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
        }

        onMouseDown(pointer: any) {
          this.rememberPointer(pointer);
          super.onMouseDown(pointer);
        }

        onMouseMove(pointer: any) {
          if (!this.shouldAddChunk(pointer)) return;
          this.rememberPointer(pointer);
          super.onMouseMove(pointer);
        }

        onMouseUp() {
          const originalRenderOnAddRemove = this.canvas.renderOnAddRemove;
          this.canvas.renderOnAddRemove = false;

          const rects: any[] = [];
          for (let i = 0; i < this.sprayChunks.length; i += 1) {
            const chunk = this.sprayChunks[i];
            for (let j = 0; j < chunk.length; j += 1) {
              const dot = chunk[j];
              rects.push(
                new fabric.Rect({
                  width: dot.width,
                  height: dot.width,
                  left: dot.x + 1,
                  top: dot.y + 1,
                  originX: "center",
                  originY: "center",
                  fill: this.composeFill(dot.opacity ?? 1),
                })
              );
            }
          }

          const group = new fabric.Group(
            this.optimizeOverlapping ? uniqueRects(rects) : rects,
            {
              objectCaching: true,
              subTargetCheck: false,
              interactive: false,
            }
          );
          if (this.shadow) {
            group.set("shadow", new fabric.Shadow(this.shadow));
          }
          this.canvas.fire("before:path:created", { path: group });
          this.canvas.add(group);
          this.canvas.fire("path:created", { path: group });

          this.canvas.clearContext(this.canvas.contextTop);
          this._resetShadow();
          this.canvas.renderOnAddRemove = originalRenderOnAddRemove;
          this.canvas.requestRenderAll();
          this.rememberPointer(null);
        }
      }
      fabric.SprayBrushEx = SprayBrushEx;
    }
    return fabric.SprayBrushEx;
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

  const prepareBaseBrush = (brush: any) => {
    if (brush) {
      brush.shadow = null;
      brush.strokeUniform = true;
    }
    return brush;
  };

  const applyStrokeMeta = (target: any, width: number) => {
    if (!target || typeof target.set !== "function") return;
    const patch: Record<string, any> = { strokeUniform: true };
    if (width > 0 && typeof target.strokeWidth === "number") {
      patch.strokeWidth = width;
    }
    target.set(patch);
  };

  const propagateStrokeMeta = (target: any, width: number) => {
    if (!target) return;
    applyStrokeMeta(target, width);
    if (Array.isArray(target._objects)) {
      target._objects.forEach((child: any) => propagateStrokeMeta(child, width));
    }
  };

  const attachPathMeta = (path: any, meta: typeof brushMetaRef.current, width: number) => {
    if (!path || !meta) return;
    try {
      path.__brushMeta = { ...meta, width };
      path.setCoords?.();
      path.dirty = true;
    } catch {}
  };

  const applyBrushMetaToPath = (path: any) => {
    if (!path) return;
    const meta = brushMetaRef.current;
    if (!meta) return;
    const safeWidth = Math.max(1, meta.width || 1);

    if (meta.variant !== "spray") {
      propagateStrokeMeta(path, safeWidth);
    }

    attachPathMeta(path, meta, safeWidth);
  };

  const attachLineMeta = (target: any, meta: LineMeta) => {
    if (!target) return target;
    target.__lineMeta = meta;
    if (!target.__lineMetaPatched) {
      const originalToObject = target.toObject;
      target.toObject = function toLineObject(this: any, additional?: any[]) {
        const base = originalToObject.call(this, additional);
        return { ...base, __lineMeta: this.__lineMeta };
      };
      Object.defineProperty(target, "__lineMetaPatched", {
        value: true,
        enumerable: false,
        configurable: true,
      });
    }
    return target;
  };

  const LINE_HANDLE_RADIUS = 6;
  const LINE_ROTATION_OFFSET = 52;
  const DEFAULT_LINE_CAP = "round" as const;

  type LineControlSet = {
    start: any;
    end: any;
    center: any;
    rotate: any;
  };

  const cloneLinePoints = (points: LinePoint[]): LinePoint[] =>
    points.map((p) => ({ x: p.x, y: p.y }));

  const computeLineMetaCenter = (points: LinePoint[]): LinePoint => {
    if (!points.length) return { x: 0, y: 0 };
    const first = points[0];
    const last = points[points.length - 1];
    return {
      x: (first.x + last.x) / 2,
      y: (first.y + last.y) / 2,
    };
  };

  const rotatePointAround = (
    point: LinePoint,
    center: LinePoint,
    radians: number
  ): LinePoint => {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  };

  const ensureLineControls = (): LineControlSet | null => {
    const fabric = fabricRef.current;
    if (!fabric) return null;

    const cached = (fabric as any).__moldaLineControls as LineControlSet | undefined;
    if (cached) return cached;

    const { Control, Point, controlsUtils } = fabric;

    const drawHandle = (
      ctx: CanvasRenderingContext2D,
      left: number,
      top: number,
      fill: string
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(left, top, LINE_HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.25;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const endpointPositionHandler = (index: 0 | 1) =>
      function positionHandler(_dim: any, finalMatrix: number[], target: any) {
        const meta: LineMeta | undefined = target.__lineMeta;
        if (!meta || meta.points.length < 2) {
          return fabric.util.transformPoint(new Point(0, 0), finalMatrix);
        }
        const anchorIndex = index === 0 ? 0 : meta.points.length - 1;
        const worldPoint = meta.points[anchorIndex];
        const localPoint = target.toLocalPoint(
          new Point(worldPoint.x, worldPoint.y),
          "center",
          "center"
        );
        return fabric.util.transformPoint(localPoint, finalMatrix);
      };

    const endpointActionHandler = (index: 0 | 1) =>
      function actionHandler(eventData: any, transform: any) {
        const target: any = transform.target;
        const meta: LineMeta | undefined = target?.__lineMeta;
        if (!target || !meta) return false;
        const canvas = target.canvas;
        if (!canvas) return false;

        const pointer = canvas.getPointer(eventData.e, false);
        const anchorIndex = index === 0 ? 0 : meta.points.length - 1;
        const nextPoints = cloneLinePoints(meta.points);
        nextPoints[anchorIndex] = { x: pointer.x, y: pointer.y };

        runWithLineTransformGuard(() => {
          meta.points = nextPoints;
          attachLineMeta(target, meta);
          applyLineGeometryFromMeta(target, meta);
        });

        canvas.requestRenderAll();
        transform.actionPerformed = true;
        return true;
      };

    const endpointRenderer = (
      ctx: CanvasRenderingContext2D,
      left: number,
      top: number
    ) => drawHandle(ctx, left, top, "#38bdf8");

    const centerPositionHandler = function positionHandler(
      _dim: any,
      finalMatrix: number[],
      _target: any
    ) {
      return fabric.util.transformPoint(new Point(0, 0), finalMatrix);
    };

    const moveActionHandler = (eventData: any, transform: any, x: number, y: number) => {
      const target: any = transform.target;
      let performed = false;
      runWithLineTransformGuard(() => {
        performed = controlsUtils.dragHandler(eventData, transform, x, y);
        if (performed) {
          updateMetaAfterMove(target);
        }
      });
      return performed;
    };

    const centerRenderer = (
      ctx: CanvasRenderingContext2D,
      left: number,
      top: number
    ) => drawHandle(ctx, left, top, "#0ea5e9");

    const rotationPositionHandler = function positionHandler(
      _dim: any,
      finalMatrix: number[],
      _target: any
    ) {
      return fabric.util.transformPoint(
        new Point(0, -LINE_ROTATION_OFFSET),
        finalMatrix
      );
    };

    const rotationRenderer = (
      ctx: CanvasRenderingContext2D,
      left: number,
      top: number,
      _styleOverride: any,
      _target: any
    ) => {
      drawHandle(ctx, left, top, "#0284c7");
    };

    const rotationActionHandler = (
      eventData: any,
      transform: any,
      x: number,
      y: number
    ) => {
      const target: any = transform.target;
      let performed = false;
      runWithLineTransformGuard(() => {
        performed = controlsUtils.rotationWithSnapping(
          eventData,
          transform,
          x,
          y
        );
        if (performed) {
          updateMetaAfterMove(target);
          updateMetaAfterRotate(target);
        }
      });
      return performed;
    };

    const controls: LineControlSet = {
      start: new Control({
        cursorStyle: "crosshair",
        render: endpointRenderer,
        positionHandler: endpointPositionHandler(0),
        actionHandler: endpointActionHandler(0),
      }),
      end: new Control({
        cursorStyle: "crosshair",
        render: endpointRenderer,
        positionHandler: endpointPositionHandler(1),
        actionHandler: endpointActionHandler(1),
      }),
      center: new Control({
        cursorStyle: "move",
        render: centerRenderer,
        positionHandler: centerPositionHandler,
        actionHandler: moveActionHandler,
      }),
      rotate: new Control({
        cursorStyle: "grab",
        withConnection: true,
        render: rotationRenderer,
        positionHandler: rotationPositionHandler,
        actionHandler: rotationActionHandler,
      }),
    };

    (fabric as any).__moldaLineControls = controls;
    return controls;
  };

  const applyLineGeometryFromMeta = (target: any, meta: LineMeta) => {
    if (!meta || meta.points.length < 2) return;

    const start = meta.points[0];
    const end = meta.points[meta.points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const centerX = start.x + dx / 2;
    const centerY = start.y + dy / 2;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    target.set({
      stroke: meta.stroke,
      strokeWidth: meta.strokeWidth,
      opacity: meta.opacity,
      strokeLineCap: DEFAULT_LINE_CAP,
      strokeUniform: true,
      x1: -length / 2,
      y1: 0,
      x2: length / 2,
      y2: 0,
      left: centerX,
      top: centerY,
      originX: "center",
      originY: "center",
      angle,
      erasable: true,
      objectCaching: false,
    });
    target.setCoords();
    target.dirty = true;
  };

  const applyLineGizmo = (target: any, meta: LineMeta | undefined) => {
    if (!meta) return;
    const controls = ensureLineControls();
    if (!controls) return;

    target.hasBorders = false;
    target.transparentCorners = false;
    target.cornerColor = "#38bdf8";
    target.cornerStrokeColor = "#0f172a";
    target.lockScalingX = true;
    target.lockScalingY = true;
    target.lockScalingFlip = true;
    target.perPixelTargetFind = true;
    target.objectCaching = false;
    target.dirty = true;
    target.controls = {
      start: controls.start,
      end: controls.end,
      center: controls.center,
      mtr: controls.rotate,
    };
    if (typeof target.setControlsVisibility === "function") {
      target.setControlsVisibility({
        start: true,
        end: true,
        center: true,
        mtr: true,
      });
    }
  };

  const updateMetaAfterMove = (target: any) => {
    const meta: LineMeta | undefined = target?.__lineMeta;
    if (!meta) return;
    const center = computeLineMetaCenter(meta.points);
    const targetCenter = target.getCenterPoint?.();
    if (!targetCenter) return;
    const dx = targetCenter.x - center.x;
    const dy = targetCenter.y - center.y;
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return;
    meta.points = meta.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    attachLineMeta(target, meta);
    target.dirty = true;
  };

  const updateMetaAfterRotate = (target: any) => {
    const meta: LineMeta | undefined = target?.__lineMeta;
    if (!meta || meta.points.length < 2) return;
    const targetCenter = target.getCenterPoint?.();
    if (!targetCenter) return;
    const currentCenter = computeLineMetaCenter(meta.points);
    const dx = targetCenter.x - currentCenter.x;
    const dy = targetCenter.y - currentCenter.y;
    let workingPoints = meta.points;
    if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) {
      workingPoints = workingPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    const start = workingPoints[0];
    const end = workingPoints[workingPoints.length - 1];
    const currentAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const targetAngleDeg = target.getTotalAngle?.() ?? target.angle ?? 0;
    const delta = ((targetAngleDeg as number) * Math.PI) / 180 - currentAngle;
    if (Math.abs(delta) < 1e-3) {
      if (workingPoints !== meta.points) {
        meta.points = workingPoints;
        attachLineMeta(target, meta);
      }
      return;
    }
    const rotated = workingPoints.map((p) => rotatePointAround(p, targetCenter, delta));
    meta.points = rotated;
    attachLineMeta(target, meta);
    target.dirty = true;
  };

  const createLineObject = (
    points: LinePoint[],
    options: {
      stroke: string;
      strokeWidth: number;
      opacity: number;
    }
  ) => {
    const fabric = fabricRef.current;
    if (!fabric || points.length < 2) return null;

    const safeWidth = Math.max(1, options.strokeWidth || 1);
    const line = new fabric.Line(
      [points[0].x, points[0].y, points[1].x, points[1].y],
      {
        stroke: options.stroke,
        strokeWidth: safeWidth,
        opacity: options.opacity,
        strokeLineCap: DEFAULT_LINE_CAP,
        strokeUniform: true,
        fill: "transparent",
        selectable: true,
        evented: true,
        objectCaching: false,
        perPixelTargetFind: true,
        erasable: true,
      }
    );

    const meta: LineMeta = {
      version: 1,
      points: cloneLinePoints(points),
      stroke: options.stroke,
      strokeWidth: safeWidth,
      opacity: options.opacity,
    };

    attachLineMeta(line, meta);
    applyLineGeometryFromMeta(line, meta);
    applyLineGizmo(line, meta);
    line.dirty = true;
    return line;
  };

  const restoreLineMetaOnObject = (obj: any) => {
    if (!obj) return;
    if (obj.__lineMeta) {
      const meta = obj.__lineMeta as LineMeta;
      obj.objectCaching = false;
      attachLineMeta(obj, meta);
      applyLineGeometryFromMeta(obj, meta);
      applyLineGizmo(obj, meta);
    }
    if (typeof obj.forEachObject === "function") {
      obj.forEachObject((child: any) => restoreLineMetaOnObject(child));
    } else if (Array.isArray(obj._objects)) {
      obj._objects.forEach((child: any) => restoreLineMetaOnObject(child));
    }
  };

  const restoreLineObjects = (canvas: FabricCanvas) => {
    if (!canvas) return;
    canvas.getObjects().forEach((obj: any) => restoreLineMetaOnObject(obj));
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

    const safeWidth = Math.max(1, width);

    if (variant === "eraser") {
      if (fabric.EraserBrush) {
        const eraser: any = prepareBaseBrush(new fabric.EraserBrush(c));
        eraser.width = safeWidth;
        eraser.inverted = false;
        eraser.decimate = Math.max(1, Math.floor(safeWidth / 4));
        eraser.erasingWidthAliasing = 0;
        return eraser;
      }
      console.warn("[Editor2D] fabric.EraserBrush não disponível, usando PencilBrush como fallback");
    }

    let brush: any = prepareBaseBrush(new fabric.PencilBrush(c));
    brush.color = withAlpha(color, alpha);
    brush.width = safeWidth;
    brush.strokeLineCap = "round";
    brush.strokeLineJoin = "round";

    if (variant === "spray") {
      const Spray = ensureSprayBrush(fabric);
      const sb: any = prepareBaseBrush(new Spray(c));
      sb.width = Math.max(10, safeWidth * 1.4);
      sb.density = Math.max(15, Math.min(70, 24 + safeWidth * 1.2));
      sb.dotWidth = Math.max(1, safeWidth * 0.12);
      sb.dotWidthVariance = Math.max(0.5, safeWidth * 0.06);
      sb.randomOpacity = true;
      sb.optimizeOverlapping = false;
      sb.color = withAlpha(color, alpha);
      if (typeof sb.setMinDistance === "function") {
        sb.setMinDistance(Math.max(2, Math.min(24, safeWidth * 0.25)));
      }
      return sb;
    }

    if (variant === "marker") {
      brush.width = Math.max(4, safeWidth);
      brush.color = withAlpha(color, Math.min(0.7, alpha));
      return brush;
    }

    if (variant === "calligraphy") {
      const Calli = ensureCalligraphyBrush(fabric);
      const cb: any = prepareBaseBrush(new Calli(c));
      cb.opacity = alpha;
      cb.color = withAlpha(color, alpha);
      cb.nibSize = Math.max(8, safeWidth * 2.2);
      cb.nibThin = 0.22;
      cb.nibAngle = 35;
      return cb;
    }

    return brush;
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
        erasable: true,
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
      void ensureCanvasReady();
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
            erasable: true,
          });
          c.add(img);
          c.setActiveObject(img);
          try { c.requestRenderAll?.(); } catch {}
        },
        { crossOrigin: "anonymous" }
      );
    }
  };

  // ===== Context Menu Functions =====
  const getSelectionInfo = (): SelectionInfo | null => {
    const c = canvasRef.current;
    if (!c) return null;
    
    const activeObject = c.getActiveObject();
    const activeSelection = c.getActiveObjects();
    const hasSelection = !!activeObject && activeSelection.length > 0;
    
    if (!hasSelection) {
      return {
        hasSelection: false,
        hasClipboard: !!clipboardRef.current,
        isFullyLocked: false,
        canBringForward: false,
        canSendBackward: false,
        canBringToFront: false,
        canSendToBack: false,
        canGroup: false,
      };
    }

    const allObjects = c.getObjects();
    const selectedObjects = activeSelection;
    
    // Check if all selected objects are locked
    const isFullyLocked = selectedObjects.every((obj: any) => 
      obj.lockMovementX && obj.lockMovementY && obj.lockScalingX && obj.lockScalingY && obj.lockRotation
    );

    // Check layering possibilities
    const maxIndex = Math.max(...selectedObjects.map((obj: any) => allObjects.indexOf(obj)));
    const minIndex = Math.min(...selectedObjects.map((obj: any) => allObjects.indexOf(obj)));
    
    const canBringForward = maxIndex < allObjects.length - 1;
    const canSendBackward = minIndex > 0;
    const canBringToFront = maxIndex < allObjects.length - 1;
    const canSendToBack = minIndex > 0;
    
    // Can group if more than one object selected and they're not already grouped
    const canGroup = selectedObjects.length > 1 && !selectedObjects.some((obj: any) => obj.type === 'group');

    return {
      hasSelection: true,
      hasClipboard: !!clipboardRef.current,
      isFullyLocked,
      canBringForward,
      canSendBackward,
      canBringToFront,
      canSendToBack,
      canGroup,
    };
  };

  const computeSelectionKind = (): "none" | "text" | "other" => {
    const c = canvasRef.current as any;
    if (!c) return "none";
    const active: any = c.getActiveObject && c.getActiveObject();
    const activeObjects: any[] = c.getActiveObjects ? c.getActiveObjects() : [];
    if (!active || activeObjects.length === 0) return "none";
    const t = String(active.type || "").toLowerCase();
    if (t.includes("text")) return "text";
    return "other";
  };

  const notifySelectionKind = () => {
    const kind = computeSelectionKind();
    selectionListenersRef.current.forEach((cb) => {
      try { cb(kind); } catch {}
    });
  };

  const clipboardRef = useRef<any>(null);

  const copySelection = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObject = c.getActiveObject();
    if (!activeObject) return;
    
    activeObject.clone((cloned: any) => {
      clipboardRef.current = cloned;
    });
  };

  const pasteSelection = () => {
    const c = canvasRef.current;
    if (!c || !clipboardRef.current) return;
    
    clipboardRef.current.clone((cloned: any) => {
      c.discardActiveObject();
      cloned.set({
        left: cloned.left + 10,
        top: cloned.top + 10,
        evented: true,
      });
      if (cloned.type === 'activeSelection') {
        cloned.canvas = c;
        cloned.forEachObject((obj: any) => {
          c.add(obj);
        });
        cloned.setCoords();
      } else {
        c.add(cloned);
      }
      clipboardRef.current.top += 10;
      clipboardRef.current.left += 10;
      c.setActiveObject(cloned);
      c.requestRenderAll();
      historyRef.current?.push("paste");
      emitHistory();
    });
  };

  const duplicateSelection = () => {
    copySelection();
    pasteSelection();
  };

  const toggleLockSelection = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObjects = c.getActiveObjects();
    if (activeObjects.length === 0) return;
    
    const isLocked = activeObjects[0].lockMovementX;
    
    activeObjects.forEach((obj: any) => {
      obj.set({
        lockMovementX: !isLocked,
        lockMovementY: !isLocked,
        lockScalingX: !isLocked,
        lockScalingY: !isLocked,
        lockRotation: !isLocked,
        selectable: isLocked, // If unlocking, make selectable
      });
    });
    
    c.requestRenderAll();
    historyRef.current?.push("lock");
    emitHistory();
  };

  const bringSelectionForward = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObjects = c.getActiveObjects();
    activeObjects.forEach((obj: any) => {
      c.bringForward(obj);
    });
    
    c.requestRenderAll();
    historyRef.current?.push("bring-forward");
    emitHistory();
  };

  const sendSelectionBackward = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObjects = c.getActiveObjects();
    activeObjects.forEach((obj: any) => {
      c.sendBackwards(obj);
    });
    
    c.requestRenderAll();
    historyRef.current?.push("send-backward");
    emitHistory();
  };

  const bringSelectionToFront = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObjects = c.getActiveObjects();
    activeObjects.forEach((obj: any) => {
      c.bringToFront(obj);
    });
    
    c.requestRenderAll();
    historyRef.current?.push("bring-to-front");
    emitHistory();
  };

  const sendSelectionToBack = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObjects = c.getActiveObjects();
    activeObjects.forEach((obj: any) => {
      c.sendToBack(obj);
    });
    
    c.requestRenderAll();
    historyRef.current?.push("send-to-back");
    emitHistory();
  };

  const groupSelection = () => {
    const c = canvasRef.current;
    if (!c) return;
    
    const activeObjects = c.getActiveObjects();
    if (activeObjects.length < 2) return;
    
    const group = new (window as any).fabric.Group(activeObjects, {
      canvas: c,
    });
    
    activeObjects.forEach((obj: any) => {
      c.remove(obj);
    });
    
    c.add(group);
    c.setActiveObject(group);
    c.requestRenderAll();
    
    historyRef.current?.push("group");
    emitHistory();
  };

  const refresh = () => {
    const c = canvasRef.current;
    if (c) {
      try { c.requestRenderAll(); } catch {}
    }
  };

  const listUsedFonts = (): string[] => {
    const c = canvasRef.current;
    if (!c) return [];
    
    const fonts = new Set<string>();
    const objects = c.getObjects();
    
    objects.forEach((obj: any) => {
      if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
        if (obj.fontFamily) {
          fonts.add(obj.fontFamily);
        }
      } else if (obj.type === 'group') {
        obj.forEachObject?.((subObj: any) => {
          if ((subObj.type === 'text' || subObj.type === 'i-text' || subObj.type === 'textbox') && subObj.fontFamily) {
            fonts.add(subObj.fontFamily);
          }
        });
      }
    });
    
    return Array.from(fonts);
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
    
    // Context Menu Functions
    getSelectionInfo,
    copySelection,
    pasteSelection,
    duplicateSelection,
    toggleLockSelection,
    bringSelectionForward,
    sendSelectionBackward,
    bringSelectionToFront,
    sendSelectionToBack,
    groupSelection,
    refresh,
    listUsedFonts,
    waitForIdle,
  }));

  // Inicialização principal
  useEffect(() => {
    let disposed = false;

    const init = async () => {
      try {
        console.log("[Editor2D] Init started");
        const fabric = await loadFabricRuntime();
        console.log("[Editor2D] Fabric loaded:", !!fabric, !!fabric?.Canvas);
        
        if (disposed || !hostRef.current) {
          console.log("[Editor2D] Disposed or no host, aborting");
          return;
        }

        // Verificação dupla para garantir que Canvas existe
        if (!fabric || !fabric.Canvas) {
          console.error("[Editor2D] Fabric.Canvas not available after load");
          return;
        }

        installFabricEraser(fabric);

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
        // Garante re-render imediato ao adicionar/remover
        c.renderOnAddRemove = true;
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
              flushIdleResolvers();
            }
            emitHistory();
          },
        });
        historyRef.current.captureInitial();
        emitHistory();

        // Eventos simples do histórico
        const __onAdded = () => {
          if (shouldRecordHistory())
            historyRef.current?.push("add");
          emitHistory();
          try { c.requestRenderAll(); } catch {}
          notifySelectionKind();
        };
        const __onRemoved = () => {
          if (shouldRecordHistory())
            historyRef.current?.push("remove");
          emitHistory();
          try { c.requestRenderAll(); } catch {}
          notifySelectionKind();
        };
        const __onModified = () => {
          if (shouldRecordHistory())
            historyRef.current?.push("modify");
          emitHistory();
          try { c.requestRenderAll(); } catch {}
          notifySelectionKind();
        };
        const __onErasingStart = () => {
          erasingCountRef.current += 1;
        };
        const __onErasingEnd = () => {
          erasingCountRef.current = Math.max(0, erasingCountRef.current - 1);
          flushIdleResolvers();
        };
        const __onPath = (evt: any) => {
          const path = evt?.path;
          if (path) {
            applyBrushMetaToPath(path);
            if (
              typeof path.set === "function" &&
              path.globalCompositeOperation !== "destination-out"
            ) {
              path.set({ erasable: true });
            }
          }
          const activeTool = toolRef.current;
          if (
            activeTool === "brush" ||
            activeTool === "curve" ||
            brushMetaRef.current.variant === "eraser"
          ) {
            c.isDrawingMode = true;
            c.selection = false;
            c.skipTargetFind = true;
            setObjectsSelectable(c, false);
            setHostCursor("crosshair");
          }
          if (shouldRecordHistory())
            historyRef.current?.push("draw");
          emitHistory();
          try { c.requestRenderAll(); } catch {}
        };

        const __onMoving = (evt: any) => {
          if (lineTransformGuardRef.current > 0) return;
          updateMetaAfterMove(evt?.target);
        };

        const __onRotating = (evt: any) => {
          if (lineTransformGuardRef.current > 0) return;
          const target = evt?.target;
          updateMetaAfterMove(target);
          updateMetaAfterRotate(target);
        };

        c.on("object:added", __onAdded);
        c.on("object:removed", __onRemoved);
        c.on("object:modified", __onModified);
        c.on("object:selected", notifySelectionKind);
        c.on("selection:created", notifySelectionKind);
        c.on("selection:updated", notifySelectionKind);
        c.on("selection:cleared", notifySelectionKind);
        c.on("path:created", __onPath);
        c.on("erasing:start", __onErasingStart);
        c.on("erasing:end", __onErasingEnd);
        c.on("object:moving", __onMoving);
        c.on("object:rotating", __onRotating);

        setCanvasReady(true);
        console.log("[Editor2D] Canvas ready set to true");

      } catch (err) {
        console.error("[Editor2D] init: erro", err);
      }
    };

    init();

    return () => {
      disposed = true;
      if (idleResolversRef.current.size) {
        const pending = Array.from(idleResolversRef.current);
        idleResolversRef.current.clear();
        pending.forEach((resolve) => {
          try {
            resolve();
          } catch {}
        });
      }
      const c = canvasRef.current;
      if (c) {
        c.off("object:added");
        c.off("object:removed");
        c.off("object:modified");
        c.off("path:created");
        c.off("erasing:start");
        c.off("erasing:end");
        c.off("object:moving");
        c.off("object:rotating");
        c.dispose?.();
      }
      roRef.current?.disconnect();
    };
  }, []);

  // ----------------------- tool switching -----------------------
  useEffect(() => {
    console.log("[Editor2D] Tool effect:", { canvasReady, tool, brushVariant, hasCanvas: !!canvasRef.current });
    if (!canvasReady) return;
    const c = canvasRef.current;
    if (!c) {
      console.log("[Editor2D] No canvas in tool effect");
      setHostCursor("default");
      return;
    }
    const fabric = fabricRef.current;
    if (!fabric) {
      console.log("[Editor2D] No fabric in tool effect");
      return;
    }

    // reset handlers
    detachLineListeners(c);

    const enableDrawingMode = (cursor: string) => {
      c.isDrawingMode = true;
      c.selection = false;
      c.skipTargetFind = true;
      setObjectsSelectable(c, false);
      c.discardActiveObject();
      setHostCursor(cursor);
    };

    const disableDrawingMode = (cursor: string) => {
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      setHostCursor(cursor);
      c.discardActiveObject();
    };

    const setupFreeDrawingBrush = () => {
      const b = createBrush(c, brushVariant, strokeColor, strokeWidth, opacity);
      c.freeDrawingBrush = b || new fabric.PencilBrush(c);
      if (!b) {
        c.freeDrawingBrush.color = withAlpha(strokeColor, opacity);
        c.freeDrawingBrush.width = strokeWidth;
      }
      c.renderAll();
    };

    // SELECT
    if (tool === "select") {
      disableDrawingMode("default");
      c.renderAll();
      return;
    }

    // TEXT (funciona como select)
    if (tool === "text") {
      disableDrawingMode("default");
      c.renderAll();
      return;
    }

    // BRUSH/CURVE/ERASER (eraser é um variant especial)
    if (tool === "brush" || tool === "curve" || brushVariant === "eraser") {
      enableDrawingMode("crosshair");
      setupFreeDrawingBrush();
      return;
    }

    // LINE (modo especial com mouse listeners)
    if (tool === "line") {
      const fabric = fabricRef.current;
      if (!fabric) {
        console.warn("[Editor2D] Fabric não disponível para ferramenta de linha");
        return;
      }

      c.isDrawingMode = false;
      c.selection = false;
      c.skipTargetFind = true;
      setObjectsSelectable(c, false);
      c.discardActiveObject();
      setHostCursor("crosshair");

      let isDrawing = false;
      let startPoint: LinePoint | null = null;
      let preview: any = null;

      const snapPoint = (current: LinePoint, reference: LinePoint, shiftPressed: boolean): LinePoint => {
        if (!shiftPressed) return current;
        const dx = current.x - reference.x;
        const dy = current.y - reference.y;
        if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return current;
        const angle = Math.atan2(dy, dx);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const length = Math.hypot(dx, dy);
        return {
          x: reference.x + Math.cos(snapped) * length,
          y: reference.y + Math.sin(snapped) * length,
        };
      };

      const removePreview = () => {
        if (preview) {
          runSilently(() => c.remove(preview));
          preview = null;
        }
      };

      const ensurePreview = (start: LinePoint) => {
        if (preview) return preview;
        preview = new fabric.Line([start.x, start.y, start.x, start.y], {
          stroke: strokeColor,
          strokeWidth: Math.max(1, strokeWidth || 1),
          opacity,
          strokeLineCap: DEFAULT_LINE_CAP,
          strokeUniform: true,
          selectable: false,
          evented: false,
          objectCaching: false,
          perPixelTargetFind: false,
          excludeFromExport: true,
        });
        preview.__isPreview = true;
        runSilently(() => c.add(preview));
        return preview;
      };

      const updatePreview = (from: LinePoint, to: LinePoint, shiftPressed: boolean): LinePoint => {
        const snapped = snapPoint(to, from, shiftPressed);
        const line = ensurePreview(from);
        line.set({
          x1: from.x,
          y1: from.y,
          x2: snapped.x,
          y2: snapped.y,
          stroke: strokeColor,
          strokeWidth: Math.max(1, strokeWidth || 1),
          opacity,
        });
        line.dirty = true;
        line.setCoords();
        c.requestRenderAll();
        return snapped;
      };

      const finalizeLine = (start: LinePoint, end: LinePoint) => {
        removePreview();
        isDrawing = false;
        startPoint = null;
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (length < 2) {
          c.requestRenderAll();
          return;
        }
        const line = createLineObject([start, end], {
          stroke: strokeColor,
          strokeWidth,
          opacity,
        });
        if (!line) {
          c.requestRenderAll();
          return;
        }
        c.add(line);
        line.setCoords();
        c.setActiveObject(line);
        c.requestRenderAll();
      };

      const cancelDrawing = () => {
        removePreview();
        isDrawing = false;
        startPoint = null;
        c.requestRenderAll();
      };

      const onMouseDown = (evt: any) => {
        const pointer = c.getPointer(evt.e);
        const current: LinePoint = { x: pointer.x, y: pointer.y };
        if (isDrawing) return;
        isDrawing = true;
        startPoint = current;
        ensurePreview(current);
        updatePreview(current, current, false);
      };

      const onMouseMove = (evt: any) => {
        if (!isDrawing || !startPoint) return;
        const pointer = c.getPointer(evt.e);
        const current: LinePoint = { x: pointer.x, y: pointer.y };
        updatePreview(startPoint, current, !!evt.e.shiftKey);
      };

      const onMouseUp = (evt: any) => {
        if (!isDrawing || !startPoint) return;
        const pointer = c.getPointer(evt.e);
        const current: LinePoint = { x: pointer.x, y: pointer.y };
        const snapped = updatePreview(startPoint, current, !!evt.e.shiftKey);
        finalizeLine(startPoint, snapped);
      };

      const onKeyDown = (evt: KeyboardEvent) => {
        if (!isDrawing) return;
        if (evt.key === "Escape") {
          evt.preventDefault();
          cancelDrawing();
        }
      };

      attachLineListeners(c, {
        down: onMouseDown,
        move: onMouseMove,
        up: onMouseUp,
        keydown: onKeyDown,
      });
      c.requestRenderAll();
      return;
    }

  }, [tool, brushVariant, strokeColor, strokeWidth, opacity, canvasReady]);

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