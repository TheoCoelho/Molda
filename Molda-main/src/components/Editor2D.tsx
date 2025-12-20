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
import { DEFAULT_GIZMO_THEME } from "../../../gizmo-theme";

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

type CurveNodeKind = "corner" | "symmetric" | "disconnected";

type CurveNode = {
  anchor: LinePoint;
  handleIn: LinePoint | null;
  handleOut: LinePoint | null;
  kind: CurveNodeKind;
};

type CurveMeta = {
  version: 1;
  nodes: CurveNode[];
  closed: boolean;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fill: string | null;
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
  canApplyPattern: boolean;
  hasPattern: boolean;
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
  applyPatternToSelection: (
    patternUrl: string,
    patternRepeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat",
    patternScale?: number
  ) => void;
  removePatternFromSelection: () => void;
  previewPatternStart: (
    patternUrl: string,
    patternRepeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat",
    patternScale?: number
  ) => Promise<void>;
  previewPatternEnd: () => void;
  refresh: () => void;
  listUsedFonts: () => string[];
  waitForIdle: () => Promise<void>;
};

type Props = {
  tool: Tool;
  brushVariant: BrushVariant;
  continuousLineMode: boolean;
  onContinuousLineCancel?: () => void;
  /** Allow Editor2D to request changing the current tool (tool state lives in the parent). */
  onRequestToolChange?: (tool: Tool) => void;
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

type PreviewBackup = {
  fill: any;
  stroke: any;
};

const GIZMO_THEME = DEFAULT_GIZMO_THEME;

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
    continuousLineMode,
    onContinuousLineCancel,
    onRequestToolChange,
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
  const curveTransformGuardRef = useRef(0);
  const continuousLineModeRef = useRef(continuousLineMode);
  const lastLineEndRef = useRef<LinePoint | null>(null);
  const onContinuousLineCancelRef = useRef(onContinuousLineCancel);
  const onRequestToolChangeRef = useRef(onRequestToolChange);
  // Used to implement: only when user presses Enter the last created object should be selected.
  const lastCreatedObjectRef = useRef<any>(null);
  const curveStateRef = useRef({
    isDrawing: false,
    meta: null as CurveMeta | null,
    preview: null as any,
    pointerDownIndex: null as number | null,
    pointerDownAnchor: null as LinePoint | null,
    pointerMoved: false,
    hoverPoint: null as LinePoint | null,
    isPointerDown: false,
  });
  const patternImageCacheRef = useRef<Record<string, Promise<HTMLImageElement | null> | undefined>>({});
  const patternPreviewStateRef = useRef<{ objects: Set<any>; backup: Map<any, PreviewBackup> }>({
    objects: new Set(),
    backup: new Map(),
  });

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

  const runWithCurveTransformGuard = (cb: () => void) => {
    curveTransformGuardRef.current += 1;
    try {
      cb();
    } finally {
      curveTransformGuardRef.current = Math.max(
        0,
        curveTransformGuardRef.current - 1
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

  React.useEffect(() => {
    continuousLineModeRef.current = continuousLineMode;
    lastLineEndRef.current = null;
  }, [continuousLineMode]);

  React.useEffect(() => {
    onContinuousLineCancelRef.current = onContinuousLineCancel;
  }, [onContinuousLineCancel]);

  React.useEffect(() => {
    onRequestToolChangeRef.current = onRequestToolChange;
  }, [onRequestToolChange]);

  React.useEffect(() => {
    if (tool !== "line") {
      lastLineEndRef.current = null;
    }
  }, [tool]);

  // Global Enter behavior requested:
  // Select (and keep selected) the last created object (curve, brush stroke, etc).
  // Do not auto-switch tools here; selection stays until user selects something else
  // or changes tool.
  React.useEffect(() => {
    const onGlobalKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== "Enter") return;

      const c: any = canvasRef.current;
      if (!c) return;

      // If user is currently editing text, Enter should behave normally.
      const active: any = c.getActiveObject?.();
      const isTextEditing =
        !!active &&
        (active.isEditing === true ||
          (typeof active.enterEditing === "function" && active.hiddenTextarea));
      if (isTextEditing) return;

      const last = lastCreatedObjectRef.current;
      if (!last) return;
      if (typeof c.setActiveObject === "function") {
        evt.preventDefault();
        try {
          c.setActiveObject(last);
          c.requestRenderAll?.();
        } catch {}

        // Also switch to selection tool, as requested.
        // Defer one tick to avoid any tool-switch side-effects racing with Fabric selection.
        try {
          setTimeout(() => {
            try {
              onRequestToolChangeRef.current?.("select");
            } catch {}
          }, 0);
        } catch {
          try {
            onRequestToolChangeRef.current?.("select");
          } catch {}
        }
      }
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  const toJSON = () => {
    const c = canvasRef.current;
    if (c) {
  const data = c.toJSON([
        "selectable",
        "evented",
        "erasable",
        "eraser",
        "__lineMeta",
        "__curveMeta",
        "__moldaHasPattern",
        "__moldaPatternTarget",
        "__moldaPatternUrl",
        "__moldaPatternRepeat",
        "__moldaPatternScale",
        "__moldaOriginalFill",
        "__moldaOriginalStroke",
      ]);
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
              restoreCurveObjects(c);
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

  const LINE_HANDLE_RADIUS = GIZMO_THEME.handleRadius;
  const LINE_ROTATION_OFFSET = 52;
  const DEFAULT_LINE_CAP = "round" as const;

  const CURVE_ANCHOR_RADIUS = 6;
  const CURVE_HANDLE_RADIUS = 5;
  const CURVE_CLOSE_THRESHOLD = 12;
  const CURVE_DEFAULT_FILL = "transparent";

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
      ctx.strokeStyle = GIZMO_THEME.stroke;
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
    ) => drawHandle(ctx, left, top, GIZMO_THEME.primary);

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
    ) => drawHandle(ctx, left, top, GIZMO_THEME.secondary);

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
      drawHandle(ctx, left, top, GIZMO_THEME.secondary);
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
  target.cornerColor = GIZMO_THEME.primary;
  target.cornerStrokeColor = GIZMO_THEME.stroke;
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

  const cloneCurveNode = (node: CurveNode): CurveNode => ({
    anchor: { ...node.anchor },
    handleIn: node.handleIn ? { ...node.handleIn } : null,
    handleOut: node.handleOut ? { ...node.handleOut } : null,
    kind: node.kind,
  });

  const cloneCurveMeta = (meta: CurveMeta): CurveMeta => ({
    version: 1,
    nodes: meta.nodes.map(cloneCurveNode),
    closed: meta.closed,
    stroke: meta.stroke,
    strokeWidth: meta.strokeWidth,
    opacity: meta.opacity,
    fill: meta.fill,
  });

  const computeCurveMetaCenter = (meta: CurveMeta): LinePoint => {
    if (!meta.nodes.length) return { x: 0, y: 0 };
    let sumX = 0;
    let sumY = 0;
    meta.nodes.forEach((node) => {
      sumX += node.anchor.x;
      sumY += node.anchor.y;
    });
    return { x: sumX / meta.nodes.length, y: sumY / meta.nodes.length };
  };

  const distanceBetween = (a: LinePoint | null, b: LinePoint | null) => {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const snapPointTo45 = (origin: LinePoint, target: LinePoint): LinePoint => {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) {
      return target;
    }
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return {
      x: origin.x + Math.cos(snapped) * length,
      y: origin.y + Math.sin(snapped) * length,
    };
  };

  const mirrorHandle = (anchor: LinePoint, handle: LinePoint): LinePoint => ({
    x: anchor.x - (handle.x - anchor.x),
    y: anchor.y - (handle.y - anchor.y),
  });

  // ---- Curve coordinate helpers ----
  // We store `__curveMeta` in the object's LOCAL coordinate space.
  // This avoids drift during dragging because Fabric transforms the object,
  // and controls can be positioned by applying the object's transform matrix.
  const curveWorldToLocal = (target: any, pt: LinePoint): LinePoint => {
    const fabric = fabricRef.current;
    if (!fabric || !target) return { ...pt };
    const { Point } = fabric;
    const local = target.toLocalPoint(new Point(pt.x, pt.y), "center", "center");
    return { x: local.x, y: local.y };
  };

  const curveLocalToWorld = (target: any, pt: LinePoint): LinePoint => {
    const fabric = fabricRef.current;
    if (!fabric || !target) return { ...pt };
    const { Point } = fabric;
    const world = fabric.util.transformPoint(new Point(pt.x, pt.y), target.calcTransformMatrix());
    return { x: world.x, y: world.y };
  };

  const curveMetaWorldToLocal = (target: any, meta: CurveMeta): CurveMeta => {
    const next = cloneCurveMeta(meta);
    next.nodes = next.nodes.map((node) => ({
      anchor: curveWorldToLocal(target, node.anchor),
      handleIn: node.handleIn ? curveWorldToLocal(target, node.handleIn) : null,
      handleOut: node.handleOut ? curveWorldToLocal(target, node.handleOut) : null,
      kind: node.kind,
    }));
    return next;
  };

  const curveMetaLocalToWorld = (target: any, meta: CurveMeta): CurveMeta => {
    const next = cloneCurveMeta(meta);
    next.nodes = next.nodes.map((node) => ({
      anchor: curveLocalToWorld(target, node.anchor),
      handleIn: node.handleIn ? curveLocalToWorld(target, node.handleIn) : null,
      handleOut: node.handleOut ? curveLocalToWorld(target, node.handleOut) : null,
      kind: node.kind,
    }));
    return next;
  };

  const isHandleVisible = (anchor: LinePoint, handle: LinePoint | null) => {
    if (!handle) return false;
    return distanceBetween(anchor, handle) > 0.75;
  };

  const syncCurveControls = (target: any, meta: CurveMeta) => {
    const fabric = fabricRef.current;
    if (!fabric || !target) return;

    const { Control, Point } = fabric;

    const drawCircle = (
      ctx: CanvasRenderingContext2D,
      left: number,
      top: number,
      radius: number,
      fill: string,
      stroke: string
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(left, top, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.1;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const toWorldPoint = (controlTarget: any, ptLocal: LinePoint) => {
      // meta is local -> world for rendering connector lines
      return curveLocalToWorld(controlTarget, ptLocal);
    };

    const makePositionHandler = (getPoint: (meta: CurveMeta) => LinePoint | null) =>
      function positionHandler(_dim: any, _finalMatrix: number[], controlTarget: any) {
        const workingMeta: CurveMeta | null = controlTarget.__curveMeta || null;
        const ptLocal = (workingMeta ? getPoint(workingMeta) : null) ||
          workingMeta?.nodes[0]?.anchor || { x: 0, y: 0 };
        // ptLocal is already in LOCAL space
        return fabric.util.transformPoint(new Point(ptLocal.x, ptLocal.y), controlTarget.calcTransformMatrix());
      };

    const controls: Record<string, any> = {};

    const createAnchorControl = (index: number) =>
      new Control({
        cursorStyle: "pointer",
        actionName: `curve-anchor-${index}`,
        positionHandler: makePositionHandler((currentMeta) => currentMeta.nodes[index].anchor),
        render: (
          ctx: CanvasRenderingContext2D,
          left: number,
          top: number,
          _styleOverride: any,
          controlTarget: any
        ) => {
          const activeIndex = controlTarget.__curveActiveAnchorIndex;
          const isActive = typeof activeIndex === "number" && activeIndex === index;
          drawCircle(
            ctx,
            left,
            top,
            CURVE_ANCHOR_RADIUS,
            isActive ? GIZMO_THEME.primary : GIZMO_THEME.secondary,
            GIZMO_THEME.stroke
          );
        },
        actionHandler: (eventData: any, transform: any) => {
          const controlTarget = transform.target as any;
          const canvas = controlTarget?.canvas;
          const meta: CurveMeta | undefined = controlTarget?.__curveMeta;
          if (!controlTarget || !canvas || !meta) return false;
          const pointerWorld = canvas.getPointer(eventData.e, false);
          const pointer = curveWorldToLocal(controlTarget, { x: pointerWorld.x, y: pointerWorld.y });
          const next = cloneCurveMeta(meta);
          const node = next.nodes[index];
          let nextPosition: LinePoint = { x: pointer.x, y: pointer.y };
          if (eventData.e?.shiftKey) {
            const reference = next.nodes[index - 1]?.anchor || next.nodes[index + 1]?.anchor || node.anchor;
            nextPosition = snapPointTo45(reference, nextPosition);
          }
          const dx = nextPosition.x - node.anchor.x;
          const dy = nextPosition.y - node.anchor.y;
          node.anchor = nextPosition;
          if (node.handleIn) {
            node.handleIn = { x: node.handleIn.x + dx, y: node.handleIn.y + dy };
          }
          if (node.handleOut) {
            node.handleOut = { x: node.handleOut.x + dx, y: node.handleOut.y + dy };
          }
          controlTarget.__curveActiveAnchorIndex = index;
          controlTarget.__curveMeta = next;
          runWithCurveTransformGuard(() => {
            applyCurveMetaToPath(controlTarget, next);
          });
          if (controlTarget.__curveNeedsControlSync && controlTarget.__curveMeta) {
            syncCurveControls(controlTarget, controlTarget.__curveMeta as CurveMeta);
            controlTarget.__curveNeedsControlSync = false;
          }
          canvas.requestRenderAll();
          transform.actionPerformed = true;
          return true;
        },
      });

    const createHandleControl = (index: number, role: "handleIn" | "handleOut") =>
      new Control({
        cursorStyle: "crosshair",
        actionName: `curve-${role}-${index}`,
        positionHandler: makePositionHandler((currentMeta) => {
          const node = currentMeta.nodes[index];
          return node[role] || node.anchor;
        }),
        render: (
          ctx: CanvasRenderingContext2D,
          left: number,
          top: number,
          _styleOverride: any,
          controlTarget: any
        ) => {
          const metaLocal: CurveMeta | undefined = controlTarget.__curveMeta;
          if (!metaLocal) return;
          const node = metaLocal.nodes[index];
          // `left/top` are in CANVAS coordinates (already include viewportTransform).
          // Our meta conversion currently yields WORLD coordinates, so we must apply
          // viewportTransform to draw connector lines in the same space.
          const canvas = controlTarget?.canvas as any;
          const vpt = canvas?.viewportTransform || null;
          const anchorWorld = toWorldPoint(controlTarget, node.anchor);
          const anchorCanvas = vpt
            ? fabric.util.transformPoint(new Point(anchorWorld.x, anchorWorld.y), vpt)
            : new Point(anchorWorld.x, anchorWorld.y);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(anchorCanvas.x, anchorCanvas.y);
          ctx.lineTo(left, top);
          ctx.strokeStyle = GIZMO_THEME.secondary;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 2]);
          ctx.stroke();
          ctx.restore();
          drawCircle(
            ctx,
            left,
            top,
            CURVE_HANDLE_RADIUS,
            GIZMO_THEME.secondary,
            GIZMO_THEME.stroke
          );
        },
        actionHandler: (eventData: any, transform: any) => {
          const controlTarget = transform.target as any;
          const canvas = controlTarget?.canvas;
          const meta: CurveMeta | undefined = controlTarget?.__curveMeta;
          if (!controlTarget || !canvas || !meta) return false;
          const pointerWorld = canvas.getPointer(eventData.e, false);
          const pointer = curveWorldToLocal(controlTarget, { x: pointerWorld.x, y: pointerWorld.y });
          const next = cloneCurveMeta(meta);
          const node = next.nodes[index];
          const snapped = eventData.e?.shiftKey ? snapPointTo45(node.anchor, { x: pointer.x, y: pointer.y }) : { x: pointer.x, y: pointer.y };
          if (role === "handleIn") {
            node.handleIn = snapped;
            if (!eventData.e?.altKey) {
              node.kind = "symmetric";
              node.handleOut = mirrorHandle(node.anchor, snapped);
            } else {
              node.kind = "disconnected";
            }
          } else {
            node.handleOut = snapped;
            if (!eventData.e?.altKey) {
              node.kind = "symmetric";
              node.handleIn = mirrorHandle(node.anchor, snapped);
            } else {
              node.kind = "disconnected";
            }
          }
          if (!isHandleVisible(node.anchor, node.handleIn)) node.handleIn = null;
          if (!isHandleVisible(node.anchor, node.handleOut)) node.handleOut = null;
          if (!node.handleIn && !node.handleOut) {
            node.kind = "corner";
          }
          controlTarget.__curveMeta = next;
          runWithCurveTransformGuard(() => {
            applyCurveMetaToPath(controlTarget, next);
          });
          if (controlTarget.__curveNeedsControlSync && controlTarget.__curveMeta) {
            syncCurveControls(controlTarget, controlTarget.__curveMeta as CurveMeta);
            controlTarget.__curveNeedsControlSync = false;
          }
          canvas.requestRenderAll();
          transform.actionPerformed = true;
          return true;
        },
      });

    meta.nodes.forEach((node, index) => {
      controls[`curve_anchor_${index}`] = createAnchorControl(index);
      if (isHandleVisible(node.anchor, node.handleIn)) {
        controls[`curve_handleIn_${index}`] = createHandleControl(index, "handleIn");
      }
      if (isHandleVisible(node.anchor, node.handleOut)) {
        controls[`curve_handleOut_${index}`] = createHandleControl(index, "handleOut");
      }
    });

    target.controls = controls;
    target.hasBorders = false;
    target.transparentCorners = true;
    target.cornerStyle = "circle";
  target.cornerColor = GIZMO_THEME.primary;
  target.cornerStrokeColor = GIZMO_THEME.stroke;
    target.lockScalingX = true;
    target.lockScalingY = true;
    target.lockScalingFlip = true;
    target.lockSkewingX = true;
    target.lockSkewingY = true;
    target.lockRotation = true;
    target.objectCaching = false;
    target.perPixelTargetFind = true;
  };

  const createCurveMetaFromPath = (path: any): CurveMeta | null => {
    if (!path || !Array.isArray(path.path)) return null;
    const nodes: CurveNode[] = [];
    let prevPoint: LinePoint | null = null;
    let prevHandleOut: LinePoint | null = null;
    for (const segment of path.path) {
      const [cmd, ...args] = segment;
      if (cmd === "M") {
        const [x, y] = args;
        prevPoint = { x, y };
        prevHandleOut = null;
        nodes.push({
          anchor: { x, y },
          handleIn: null,
          handleOut: null,
          kind: "corner",
        });
      } else if (cmd === "C" && prevPoint) {
        const [x1, y1, x2, y2, x, y] = args;
        const handleIn: LinePoint = { x: x1, y: y1 };
        const handleOut: LinePoint = { x: x2, y: y2 };
        const anchor: LinePoint = { x, y };
        const kind: CurveNodeKind = "corner";
        const last = nodes[nodes.length - 1];
        if (last) {
          last.handleOut = handleIn;
        }
        nodes.push({
          anchor,
          handleIn: handleOut,
          handleOut: null,
          kind,
        });
        prevPoint = anchor;
        prevHandleOut = handleOut;
      } else if (cmd === "L") {
        const [x, y] = args;
        const anchor: LinePoint = { x, y };
        const last = nodes[nodes.length - 1];
        if (last) {
          last.handleOut = null;
        }
        nodes.push({
          anchor,
          handleIn: null,
          handleOut: null,
          kind: "corner",
        });
        prevPoint = anchor;
        prevHandleOut = null;
      } else if (cmd === "Z" || cmd === "z") {
        if (nodes.length > 1) {
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          last.handleOut = first.handleIn;
        }
      }
    }
    if (!nodes.length) return null;
    return {
      version: 1,
      nodes,
      closed: /z/i.test(path.path[path.path.length - 1]?.[0] ?? ""),
      stroke: path.stroke || "#000000",
      strokeWidth: path.strokeWidth || 2,
      opacity: path.opacity == null ? 1 : path.opacity,
      fill: path.fill || CURVE_DEFAULT_FILL,
    };
  };

  const attachCurveMeta = (target: any, meta: CurveMeta | null) => {
    if (!target || !meta) return;
    target.__curveMeta = meta;
    if (!target.__curveMetaPatched) {
      const originalToObject = target.toObject;
      target.toObject = function toCurveObject(this: any, additional?: any[]) {
        const base = originalToObject.call(this, additional);
        return { ...base, __curveMeta: this.__curveMeta };
      };
      Object.defineProperty(target, "__curveMetaPatched", {
        value: true,
        enumerable: false,
        configurable: true,
      });
    }
    return target;
  };

  const computeBezierFromNodes = (nodes: CurveNode[], closed: boolean) => {
    const commands: any[] = [];
    if (!nodes.length) return commands;
    const first = nodes[0];
    commands.push(["M", first.anchor.x, first.anchor.y]);
    for (let i = 1; i < nodes.length; i += 1) {
      const prev = nodes[i - 1];
      const current = nodes[i];
      const cp1 = prev.handleOut || prev.anchor;
      const cp2 = current.handleIn || current.anchor;
      commands.push(["C", cp1.x, cp1.y, cp2.x, cp2.y, current.anchor.x, current.anchor.y]);
    }
    if (closed) {
      const prev = nodes[nodes.length - 1];
      const cp1 = prev.handleOut || prev.anchor;
      const cp2 = first.handleIn || first.anchor;
      commands.push(["C", cp1.x, cp1.y, cp2.x, cp2.y, first.anchor.x, first.anchor.y]);
      commands.push(["Z"]);
    }
    return commands;
  };

  const applyCurveMetaToPath = (target: any, meta: CurveMeta) => {
    if (!target || !meta) return;
    const fabric = fabricRef.current;
    if (!fabric) return;
    
    // meta is LOCAL; convert to world before updating Fabric's path
    const worldMeta = curveMetaLocalToWorld(target, meta);
    const commands = computeBezierFromNodes(worldMeta.nodes, worldMeta.closed);
    
    // Preserve pattern settings
    const preservedStroke = target.stroke;
    const preservedFill = target.fill;
    const hasPattern = target.__moldaHasPattern;
    
    // Save the current center point of the meta in world coordinates
    // We'll use this to position the object correctly after initialize()
    const worldMetaCenter = computeCurveMetaCenter(worldMeta);
    
    // Use initialize() to properly recalculate all path dimensions.
    // This prevents clipping when the path extends beyond original bounds.
    if (typeof target.initialize === "function") {
      try {
        target.initialize(commands, {
          stroke: hasPattern ? preservedStroke : meta.stroke,
          strokeWidth: Math.max(0.1, meta.strokeWidth || 1),
          strokeUniform: true,
          fill: hasPattern ? preservedFill : (meta.fill || CURVE_DEFAULT_FILL),
          opacity: meta.opacity == null ? 1 : meta.opacity,
          objectCaching: false,
        });
      } catch {
        target.path = commands;
      }
    } else {
      target.path = commands;
    }
    
    target.dirty = true;
    target.objectCaching = false;
    target.setCoords();
    
    // After initialize(), the object's transform matrix has changed.
    // We need to update __curveMeta to LOCAL coordinates relative to the NEW transform.
    // This keeps the controls aligned with the path.
    const newLocalMeta = curveMetaWorldToLocal(target, worldMeta);
    newLocalMeta.stroke = meta.stroke;
    newLocalMeta.strokeWidth = meta.strokeWidth;
    newLocalMeta.fill = meta.fill;
    newLocalMeta.opacity = meta.opacity;
    newLocalMeta.closed = meta.closed;
    target.__curveMeta = newLocalMeta;
    
    target.__curveMetaCenter = computeCurveMetaCenter(newLocalMeta);
    
    if (curveTransformGuardRef.current === 0) {
      target.__curveNeedsControlSync = false;
      syncCurveControls(target, newLocalMeta);
    } else {
      target.__curveNeedsControlSync = true;
    }

    // If a pattern is applied, re-apply it so texture stays current after reshape.
    if (target.__moldaPatternUrl) {
      void reapplyPatternForObject(target);
    }
  };

  const createCurveObject = (meta: CurveMeta) => {
    const fabric = fabricRef.current;
    if (!fabric) return null;
    // meta is world when created; convert to local for storage
    const tempPath = new fabric.Path(computeBezierFromNodes(meta.nodes, meta.closed), {
      stroke: meta.stroke,
      strokeWidth: Math.max(0.1, meta.strokeWidth || 1),
      strokeUniform: true,
      fill: meta.fill || CURVE_DEFAULT_FILL,
      opacity: meta.opacity == null ? 1 : meta.opacity,
      objectCaching: false,
      perPixelTargetFind: true,
      selectable: true,
      evented: true,
      erasable: true,
    });
    // After fabric creates it, its transforms are available; now store meta as local.
    const localMeta = curveMetaWorldToLocal(tempPath, meta);
    attachCurveMeta(tempPath, localMeta);
    applyCurveMetaToPath(tempPath, localMeta);
    syncCurveControls(tempPath, localMeta);
    return tempPath;
  };

  const restoreCurveMetaOnObject = (obj: any) => {
    if (!obj) return;
    if (obj.__curveMeta) {
      // Stored meta is LOCAL
      const meta = cloneCurveMeta(obj.__curveMeta as CurveMeta);
      attachCurveMeta(obj, meta);
      applyCurveMetaToPath(obj, meta);
      syncCurveControls(obj, meta);
    }
    if (typeof obj.forEachObject === "function") {
      obj.forEachObject((child: any) => restoreCurveMetaOnObject(child));
    } else if (Array.isArray(obj._objects)) {
      obj._objects.forEach((child: any) => restoreCurveMetaOnObject(child));
    }
  };

  const restoreCurveObjects = (canvas: FabricCanvas) => {
    if (!canvas) return;
    canvas.getObjects().forEach((obj: any) => restoreCurveMetaOnObject(obj));
  };

  const translateCurveMeta = (meta: CurveMeta, dx: number, dy: number): CurveMeta => {
    // meta is LOCAL; moving the object should not translate local points.
    // Keep helper for potential future use (e.g. baking transforms), but no-op here.
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return meta;
    return meta;
  };

  const updateCurveMetaAfterMove = (target: any) => {
    const meta: CurveMeta | undefined = target?.__curveMeta;
    if (!meta) return;

    // Use Fabric's left/top deltas as ground truth during dragging.
    // This avoids drift caused by recomputing centers from meta every mouse move.
    const left = typeof target.left === "number" ? target.left : null;
    const top = typeof target.top === "number" ? target.top : null;
    if (left == null || top == null) return;

    const lastLT = target.__curveLastLT as LinePoint | undefined;
    if (!lastLT) {
      target.__curveLastLT = { x: left, y: top };
      return;
    }

    const dx = left - lastLT.x;
    const dy = top - lastLT.y;
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return;

    // meta is LOCAL; object move doesn't change local points. Keep baseline updated.
    const next = translateCurveMeta(meta, dx, dy);
    if (next !== meta) {
      target.__curveMeta = next;
      runWithCurveTransformGuard(() => {
        applyCurveMetaToPath(target, next);
      });
    }

    // Keep baseline aligned to Fabric movement
    target.__curveLastLT = { x: left, y: top };
  };

  const clearCurvePreview = (canvas?: FabricCanvas | null) => {
    const state = curveStateRef.current;
    if (state.preview && canvas) {
      try {
        runSilently(() => {
          canvas.remove(state.preview);
        });
      } catch {}
    }
    state.preview = null;
  };

  const resetCurveState = (canvas?: FabricCanvas | null) => {
    const state = curveStateRef.current;
    if (canvas) {
      clearCurvePreview(canvas);
      try { canvas.requestRenderAll(); } catch {}
    } else {
      state.preview = null;
    }
    state.isDrawing = false;
    state.meta = null;
    state.pointerDownIndex = null;
    state.pointerDownAnchor = null;
    state.pointerMoved = false;
    state.hoverPoint = null;
    state.isPointerDown = false;
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
        canApplyPattern: false,
        hasPattern: false,
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

    const compatibleTypes = new Set([
      "path",
      "rect",
      "circle",
      "ellipse",
      "polygon",
      "triangle",
      "textbox",
      "i-text",
      "text",
      "group",
      "activeSelection",
    ]);
    const baseType = String(activeObject?.type || "").toLowerCase();
    const canApplyPattern = compatibleTypes.has(baseType);

    // Detect pattern on selection (any selected object has metadata)
    const hasPattern = selectedObjects.some((obj: any) => !!obj?.__moldaHasPattern);

    return {
      hasSelection: true,
      hasClipboard: !!clipboardRef.current,
      isFullyLocked,
      canBringForward,
      canSendBackward,
      canBringToFront,
      canSendToBack,
      canGroup,
      canApplyPattern,
      hasPattern,
    };
  };

  const recordPatternPreviewBackup = (obj: any) => {
    if (!obj) return;
    const state = patternPreviewStateRef.current;
    if (state.backup.has(obj)) return;
    state.backup.set(obj, { fill: obj.fill, stroke: obj.stroke });
    state.objects.add(obj);
  };

  const clearPatternPreview = () => {
    const state = patternPreviewStateRef.current;
    if (!state.objects.size) return;
    const c = canvasRef.current;
    let needsRender = false;
    state.objects.forEach((obj) => {
      const backup = state.backup.get(obj);
      if (!backup) return;
      runSilently(() => {
        obj.set({
          fill: backup.fill,
          stroke: backup.stroke,
        });
        try { obj.setCoords?.(); } catch {}
      });
      state.backup.delete(obj);
      needsRender = true;
    });
  state.objects.clear();
  state.backup.clear();
    if (needsRender) {
      try {
        c?.requestRenderAll?.();
      } catch {}
    }
  };

  const loadPatternImage = (patternUrl: string): Promise<HTMLImageElement | null> => {
    if (!patternUrl) return Promise.resolve(null);
    const cache = patternImageCacheRef.current;
    if (cache[patternUrl]) return cache[patternUrl];
    const fabric = fabricRef.current;
    if (!fabric || !fabric.util || typeof fabric.util.loadImage !== "function") {
      return Promise.resolve(null);
    }
    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      fabric.util.loadImage(
        patternUrl,
        (img: HTMLImageElement | null) => {
          resolve(img ?? null);
        },
        null,
        { crossOrigin: "anonymous" }
      );
    });
    cache[patternUrl] = promise;
    return promise;
  };

  const createPatternInstance = (
    img: HTMLImageElement,
    repeat: string,
    scale: number
  ) => {
    const fabric = fabricRef.current;
    if (!fabric) return null;
    return new fabric.Pattern({
      source: img,
      repeat,
      patternTransform: [scale, 0, 0, scale, 0, 0],
    });
  };

  const visitLeafObjects = (obj: any, cb: (leaf: any) => void) => {
    if (!obj) return;
    if (typeof obj.forEachObject === "function") {
      obj.forEachObject((child: any) => visitLeafObjects(child, cb));
      return;
    }
    if (Array.isArray(obj._objects) && obj._objects.length) {
      obj._objects.forEach((child: any) => visitLeafObjects(child, cb));
      return;
    }
    cb(obj);
  };

  const applyPatternToSingleObject = (
    obj: any,
    target: "stroke" | "fill",
    pattern: any,
    saveMeta: boolean,
    meta: { url: string; repeat: string; scale: number },
    options?: { isPreview?: boolean }
  ) => {
    if (!obj || !pattern) return;
    if (options?.isPreview) {
      recordPatternPreviewBackup(obj);
    } else {
      if (obj.__moldaOriginalFill === undefined) obj.__moldaOriginalFill = obj.fill;
      if (obj.__moldaOriginalStroke === undefined)
        obj.__moldaOriginalStroke = obj.stroke;
    }
    const patch: any = {
      objectCaching: false,
    };
    if (target === "stroke") {
      Object.assign(patch, {
        stroke: pattern,
        strokeUniform: true,
        strokeLineCap: "round",
        strokeLineJoin: "round",
      });
    } else {
      patch.fill = pattern;
    }
    obj.set(patch);
    // Explicitly mark the object as dirty and refresh its bounding box so
    // the pattern renders correctly across the entire new geometry.
    obj.dirty = true;
    if (typeof obj._setPositionDimensions === "function") {
      try { obj._setPositionDimensions({}); } catch {}
    }
    if (typeof obj.setCoords === "function") {
      try { obj.setCoords(); } catch {}
    }
    if (saveMeta) {
      obj.__moldaHasPattern = true;
      obj.__moldaPatternTarget = target;
      obj.__moldaPatternUrl = meta.url;
      obj.__moldaPatternRepeat = meta.repeat;
      obj.__moldaPatternScale = meta.scale;
    }
    try {
      obj.setCoords?.();
    } catch {}
  };

  const runPatternApplication = async (
    patternUrl: string,
    patternRepeat: "repeat" | "repeat-x" | "repeat-y" | "no-repeat",
    patternScale: number,
    isPreview: boolean
  ) => {
    const c = canvasRef.current;
    if (!c) return;
    clearPatternPreview();
    const selectedObjects = c.getActiveObjects?.() ?? [];
    if (!selectedObjects.length) return;
    const safeScale = Math.max(0.001, patternScale);
    const img = await loadPatternImage(patternUrl);
    if (!img) return;
    const meta = { url: patternUrl, repeat: patternRepeat, scale: safeScale };
    const applyTarget = (obj: any) => {
      visitLeafObjects(obj, (leaf) => {
        const t = String(leaf?.type || "").toLowerCase();
        const target: "stroke" | "fill" = t === "path" ? "stroke" : "fill";
        const pattern = createPatternInstance(img, patternRepeat, safeScale);
        if (pattern) {
          applyPatternToSingleObject(leaf, target, pattern, !isPreview, meta, {
            isPreview,
          });
        }
      });
      if (!isPreview) {
        obj.__moldaHasPattern = true;
      }
    };
    if (isPreview) {
      runSilently(() => {
        for (const obj of selectedObjects) {
          applyTarget(obj);
        }
      });
      try {
        c.requestRenderAll?.();
      } catch {}
      return;
    }
    for (const obj of selectedObjects) {
      applyTarget(obj);
    }
    try {
      c.requestRenderAll?.();
    } catch {
      try {
        c.renderAll?.();
      } catch {}
    }
    historyRef.current?.push("apply-pattern");
    emitHistory();
  };

  const previewPatternStart = (
    patternUrl: string,
    patternRepeat: "repeat" | "repeat-x" | "repeat-y" | "no-repeat" = "repeat",
    patternScale = 0.5
  ) => runPatternApplication(patternUrl, patternRepeat, patternScale, true);

  const previewPatternEnd = () => {
    clearPatternPreview();
  };

  const applyPatternToSelection = (
    patternUrl: string,
    patternRepeat: "repeat" | "repeat-x" | "repeat-y" | "no-repeat" = "repeat",
    patternScale = 0.5
  ) => {
    void runPatternApplication(patternUrl, patternRepeat, patternScale, false);
  };

  const reapplyPatternForObject = async (obj: any) => {
    if (!obj) return;
    const patternUrl = obj.__moldaPatternUrl;
    if (!patternUrl) return;
    const repeat = obj.__moldaPatternRepeat || "repeat";
    const scale = typeof obj.__moldaPatternScale === "number" ? obj.__moldaPatternScale : 1;
    const img = await loadPatternImage(patternUrl);
    if (!img) return;
    const pattern = createPatternInstance(img, repeat, scale);
    if (!pattern) return;
    runSilently(() => {
      const target = obj.__moldaPatternTarget === "stroke" ? "stroke" : "fill";
      applyPatternToSingleObject(obj, target, pattern, false, {
        url: patternUrl,
        repeat,
        scale,
      });
    });
    try {
      obj.canvas?.requestRenderAll?.();
    } catch {}
  };

  const reapplyPatternForTarget = (target: any) => {
    if (!target) return;
    visitLeafObjects(target, (child) => {
      if (child?.__moldaPatternUrl) {
        void reapplyPatternForObject(child);
      }
    });
  };

  const removePatternFromSelection = () => {
    clearPatternPreview();
    const c = canvasRef.current;
    if (!c) return;
    const selectedObjects = c.getActiveObjects?.() ?? [];
    if (!selectedObjects.length) return;

    const removeFromObject = (obj: any) => {
      if (!obj) return;
      const target = obj.__moldaPatternTarget as "stroke" | "fill" | undefined;
      const originalFill = obj.__moldaOriginalFill;
      const originalStroke = obj.__moldaOriginalStroke;

      if (target === "stroke") {
        obj.set({
          stroke: originalStroke ?? obj.stroke ?? "#000000",
          objectCaching: false,
        });
      } else if (target === "fill") {
        obj.set({
          fill: originalFill ?? obj.fill ?? "#000000",
          objectCaching: false,
        });
      } else {
        if (obj.stroke && typeof obj.stroke === "object" && obj.stroke.source) {
          obj.set({ stroke: originalStroke ?? "#000000", objectCaching: false });
        }
        if (obj.fill && typeof obj.fill === "object" && obj.fill.source) {
          obj.set({ fill: originalFill ?? "#000000", objectCaching: false });
        }
      }

      delete obj.__moldaHasPattern;
      delete obj.__moldaPatternTarget;
      delete obj.__moldaPatternUrl;
      delete obj.__moldaPatternRepeat;
      delete obj.__moldaPatternScale;

      try {
        obj.setCoords?.();
      } catch {}
    };

    for (const obj of selectedObjects) {
      visitLeafObjects(obj, removeFromObject);
      delete obj.__moldaHasPattern;
    }

    try {
      c.requestRenderAll?.();
    } catch {
      try { c.renderAll?.(); } catch {}
    }
    historyRef.current?.push("remove-pattern");
    emitHistory();
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
    applyPatternToSelection,
    removePatternFromSelection,
  previewPatternStart,
  previewPatternEnd,
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
        const __onModified = (evt: any) => {
          if (shouldRecordHistory())
            historyRef.current?.push("modify");
          emitHistory();
          try { c.requestRenderAll(); } catch {}
          notifySelectionKind();
          const target = evt?.target;
          if (target) {
            void reapplyPatternForTarget(target);
          }
        };

        const __onModifiedSyncControls = (evt: any) => {
          const target = evt?.target;
          if (!target) return;

          const syncObj = (obj: any) => {
            if (!obj) return;
            if (obj.__curveMeta) {
              try { syncCurveControls(obj, obj.__curveMeta as CurveMeta); } catch {}
            }
            // reset drag baseline for next move
            if (typeof obj.left === "number" && typeof obj.top === "number") {
              obj.__curveLastLT = { x: obj.left, y: obj.top };
            } else {
              obj.__curveLastLT = undefined;
            }
          };

          if (typeof target.forEachObject === "function") {
            try { target.forEachObject((child: any) => syncObj(child)); } catch { syncObj(target); }
          } else if (Array.isArray(target._objects) && target._objects.length) {
            target._objects.forEach((child: any) => syncObj(child));
          } else {
            syncObj(target);
          }
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

            // Remember last created stroke; selection will be applied only on Enter.
            lastCreatedObjectRef.current = path;
          }
          const activeTool = toolRef.current;
          if (
            activeTool === "brush" ||
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
          const target = evt?.target;
          if (!target) return;

          const applyToObj = (obj: any) => {
            if (!obj) return;
            if (lineTransformGuardRef.current === 0) {
              updateMetaAfterMove(obj);
            }
            if (curveTransformGuardRef.current === 0) {
              updateCurveMetaAfterMove(obj);
            }
          };

          // If the target is a group/ActiveSelection, update children as well
          if (typeof target.forEachObject === "function") {
            try {
              target.forEachObject((child: any) => applyToObj(child));
            } catch {
              // fallback to single target
              applyToObj(target);
            }
          } else if (Array.isArray(target._objects) && target._objects.length) {
            target._objects.forEach((child: any) => applyToObj(child));
          } else {
            applyToObj(target);
          }
        };

        const __onRotating = (evt: any) => {
          if (lineTransformGuardRef.current > 0) return;
          const target = evt?.target;
          if (!target) return;

          const applyRotateToObj = (obj: any) => {
            if (!obj) return;
            updateMetaAfterMove(obj);
            updateMetaAfterRotate(obj);
          };

          if (typeof target.forEachObject === "function") {
            try {
              target.forEachObject((child: any) => applyRotateToObj(child));
            } catch {
              applyRotateToObj(target);
            }
          } else if (Array.isArray(target._objects) && target._objects.length) {
            target._objects.forEach((child: any) => applyRotateToObj(child));
          } else {
            applyRotateToObj(target);
          }
        };

    c.on("object:added", __onAdded);
    c.on("object:removed", __onRemoved);
    c.on("object:modified", __onModified);
    c.on("object:modified", __onModifiedSyncControls);
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
      // Keep current selection when switching to select.
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      setHostCursor("default");
      c.renderAll();
      return;
    }

    // TEXT (funciona como select)
    if (tool === "text") {
      // Same behavior as select (do not discard selection).
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      setHostCursor("default");
      c.renderAll();
      return;
    }

    const curveState = curveStateRef.current;
    // If the user leaves the curve tool while a curve is in progress, finalize it as an OPEN curve
    // (same edit/handles functionality as closed curves). Previously we were discarding the state.
    if (tool !== "curve" && (curveState.isDrawing || curveState.preview)) {
      if (curveState.isDrawing && curveState.meta && curveState.meta.nodes.length >= 2) {
        try {
          const metaClone = cloneCurveMeta(curveState.meta);
          metaClone.stroke = strokeColor;
          metaClone.strokeWidth = strokeWidth;
          metaClone.opacity = opacity;
          metaClone.closed = !!metaClone.closed;
          clearCurvePreview(c);
          resetCurveState(null);
          const curveObject = createCurveObject(metaClone);
          if (curveObject) {
            c.add(curveObject);
            runSilently(() => {
              c.setActiveObject(curveObject);
            });
            lastCreatedObjectRef.current = curveObject;
          }
        } catch {
          // fallback: just reset like before
          resetCurveState(c);
        }
      } else {
        resetCurveState(c);
      }
      setHostCursor("default");
      try { c.requestRenderAll(); } catch {}
    }

    if (tool === "curve") {
      c.isDrawingMode = false;
      c.selection = false;
      c.skipTargetFind = true;
      setObjectsSelectable(c, false);
      c.discardActiveObject();
      setHostCursor("crosshair");

      const ensurePreview = () => {
        if (curveState.preview) return curveState.preview;
        const previewPath = new fabric.Path("M 0 0", {
          stroke: strokeColor,
          strokeWidth: Math.max(0.1, strokeWidth || 1),
          strokeUniform: true,
          fill: CURVE_DEFAULT_FILL,
          opacity,
          selectable: false,
          evented: false,
          objectCaching: false,
          excludeFromExport: true,
        });
        previewPath.__isPreview = true;
        curveState.preview = previewPath;
        runSilently(() => c.add(previewPath));
        return previewPath;
      };

      const updatePreview = () => {
        const meta = curveState.meta;
        if (!meta || !curveState.preview) return;
        meta.stroke = strokeColor;
        meta.strokeWidth = strokeWidth;
        meta.opacity = opacity;
        const commands = computeBezierFromNodes(meta.nodes, meta.closed);
        curveState.preview.path = commands;
        curveState.preview.set({
          stroke: meta.stroke,
          strokeWidth: Math.max(0.1, meta.strokeWidth || 1),
          opacity: meta.opacity,
        });
        curveState.preview.dirty = true;
        curveState.preview.setCoords();
        try { c.requestRenderAll(); } catch {}
      };

      const cancelDrawing = () => {
        clearCurvePreview(c);
        resetCurveState(null);
        setHostCursor("crosshair");
        try { c.requestRenderAll(); } catch {}
      };

      const finalizeCurve = (sourceMeta: CurveMeta, forceClose = false) => {
        if (!sourceMeta || sourceMeta.nodes.length < 2) {
          cancelDrawing();
          return;
        }
        const metaClone = cloneCurveMeta(sourceMeta);
        metaClone.stroke = strokeColor;
        metaClone.strokeWidth = strokeWidth;
        metaClone.opacity = opacity;
        if (forceClose) {
          metaClone.closed = true;
        }
        clearCurvePreview(c);
        resetCurveState(null);
        const curveObject = createCurveObject(metaClone);
        if (!curveObject) {
          try { c.requestRenderAll(); } catch {}
          return;
        }
        c.add(curveObject);
        runSilently(() => {
          c.setActiveObject(curveObject);
        });
        try { c.requestRenderAll(); } catch {}
        lastCreatedObjectRef.current = curveObject;
      };

      const onMouseDown = (evt: any) => {
        if (evt?.e?.button && evt.e.button !== 0) return;
        const pointer = c.getPointer(evt.e);
        const current: LinePoint = { x: pointer.x, y: pointer.y };
        if (!curveState.isDrawing || !curveState.meta) {
          const meta: CurveMeta = {
            version: 1,
            nodes: [
              {
                anchor: current,
                handleIn: null,
                handleOut: null,
                kind: "corner",
              },
            ],
            closed: false,
            stroke: strokeColor,
            strokeWidth,
            opacity,
            fill: CURVE_DEFAULT_FILL,
          };
          curveState.meta = meta;
          curveState.isDrawing = true;
          curveState.pointerDownIndex = 0;
          curveState.pointerDownAnchor = current;
          curveState.pointerMoved = false;
          curveState.hoverPoint = null;
          curveState.isPointerDown = true;
          ensurePreview();
          updatePreview();
          return;
        }

        const meta = curveState.meta;
        curveState.isPointerDown = true;
        const first = meta.nodes[0];
        const last = meta.nodes[meta.nodes.length - 1];
        const basePoint = evt.e.shiftKey ? snapPointTo45(last.anchor, current) : current;
        const closing =
          meta.nodes.length > 2 && Math.hypot(current.x - first.anchor.x, current.y - first.anchor.y) <= CURVE_CLOSE_THRESHOLD;
        if (closing) {
          meta.closed = true;
          updatePreview();
          finalizeCurve(meta, true);
          return;
        }
        const node: CurveNode = {
          anchor: basePoint,
          handleIn: null,
          handleOut: null,
          kind: "corner",
        };
        meta.nodes.push(node);
        curveState.pointerDownIndex = meta.nodes.length - 1;
        curveState.pointerDownAnchor = basePoint;
        curveState.pointerMoved = false;
        ensurePreview();
        updatePreview();
      };

      const onMouseMove = (evt: any) => {
        const meta = curveState.meta;
        if (!meta) return;
        const pointer = c.getPointer(evt.e);
        const current: LinePoint = { x: pointer.x, y: pointer.y };
        if (curveState.isPointerDown && typeof curveState.pointerDownIndex === "number") {
          curveState.pointerMoved = true;
          const index = curveState.pointerDownIndex;
          const node = meta.nodes[index];
          const anchor = node.anchor;
          let handlePoint = current;
          if (evt.e.shiftKey) {
            handlePoint = snapPointTo45(anchor, handlePoint);
          }
          const vector = {
            x: handlePoint.x - anchor.x,
            y: handlePoint.y - anchor.y,
          };
          const handleOut = { x: anchor.x + vector.x, y: anchor.y + vector.y };
          if (evt.e.altKey) {
            node.handleOut = handleOut;
            node.handleIn = null;
            node.kind = "corner";
          } else {
            node.handleOut = handleOut;
            node.handleIn = mirrorHandle(anchor, handleOut);
            node.kind = "symmetric";
          }
          if (!isHandleVisible(anchor, node.handleIn)) node.handleIn = null;
          if (!isHandleVisible(anchor, node.handleOut)) node.handleOut = null;
          if (!node.handleIn && !node.handleOut) node.kind = "corner";
          ensurePreview();
          updatePreview();
          return;
        }

        if (meta.nodes.length > 1) {
          const first = meta.nodes[0];
          const distance = Math.hypot(current.x - first.anchor.x, current.y - first.anchor.y);
          if (curveState.isDrawing && distance <= CURVE_CLOSE_THRESHOLD && meta.nodes.length > 2) {
            setHostCursor("pointer");
          } else {
            setHostCursor("crosshair");
          }
        }
      };

      const onMouseUp = () => {
        curveState.isPointerDown = false;
        curveState.pointerDownAnchor = null;
        curveState.pointerDownIndex = null;
        setHostCursor("crosshair");
      };

      const onDoubleClick = () => {
        if (!curveState.meta) return;
        curveState.meta.closed = false;
        finalizeCurve(curveState.meta, false);
      };

      const onKeyDown = (evt: KeyboardEvent) => {
        if (!curveState.isDrawing || !curveState.meta) {
          if (evt.key === "Escape") {
            evt.preventDefault();
            cancelDrawing();
          }
          return;
        }
        if (evt.key === "Escape") {
          evt.preventDefault();
          cancelDrawing();
          return;
        }
        if (evt.key === "Enter") {
          evt.preventDefault();
          finalizeCurve(curveState.meta, false);
          return;
        }
        if (evt.key === "Backspace" || evt.key === "Delete") {
          evt.preventDefault();
          if (curveState.meta.nodes.length <= 1) {
            cancelDrawing();
          } else {
            curveState.meta.nodes.pop();
            curveState.pointerDownIndex = curveState.meta.nodes.length - 1;
            ensurePreview();
            updatePreview();
          }
        }
      };

      if (curveState.meta && curveState.isDrawing) {
        ensurePreview();
        updatePreview();
      }

      attachLineListeners(c, {
        down: onMouseDown,
        move: onMouseMove,
        up: onMouseUp,
        dbl: onDoubleClick,
        keydown: onKeyDown,
      });
      c.requestRenderAll();
      return;
    }

    // BRUSH/ERASER (eraser é um variant especial)
    if (tool === "brush" || brushVariant === "eraser") {
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

      const resetContinuousChain = () => {
        lastLineEndRef.current = null;
      };

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

      const getLineStart = (pointerPoint: LinePoint): LinePoint => {
        if (continuousLineModeRef.current && lastLineEndRef.current) {
          return { x: lastLineEndRef.current.x, y: lastLineEndRef.current.y };
        }
        return pointerPoint;
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
        if (continuousLineModeRef.current) {
          lastLineEndRef.current = { x: end.x, y: end.y };
        } else {
          lastLineEndRef.current = null;
        }
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
        const baseStart = getLineStart(current);
        isDrawing = true;
        startPoint = baseStart;
        ensurePreview(baseStart);
        updatePreview(baseStart, current, !!evt.e.shiftKey);
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

      const onDoubleClick = () => {
        resetContinuousChain();
        cancelDrawing();
      };

      const onKeyDown = (evt: KeyboardEvent) => {
        if (evt.key === "Escape") {
          if (isDrawing) {
            evt.preventDefault();
            resetContinuousChain();
            cancelDrawing();
          }
          return;
        }
        if (evt.key === "Enter") {
          evt.preventDefault();
          resetContinuousChain();
          if (isDrawing) {
            cancelDrawing();
          }
          if (continuousLineModeRef.current) {
            try {
              onContinuousLineCancelRef.current?.();
            } catch {}
          }
        }
      };

      attachLineListeners(c, {
        down: onMouseDown,
        move: onMouseMove,
        up: onMouseUp,
        dbl: onDoubleClick,
        keydown: onKeyDown,
      });
      c.requestRenderAll();
      return;
    }

  }, [tool, brushVariant, strokeColor, strokeWidth, opacity, canvasReady, continuousLineMode]);

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