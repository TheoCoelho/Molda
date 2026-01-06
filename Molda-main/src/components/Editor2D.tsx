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
import { applyGizmoThemeToFabric, DEFAULT_GIZMO_THEME } from "../../../gizmo-theme";

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

/** Ajustes de imagem (equivalente ao menu de controle do UploadGallery) */
export type ImageAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  grayscale: number;
  hue: number;
  sharpness: number;
  definition: number;
  highlights: number;
  shadows: number;
  blackPoint: number;
  warmth: number;
  tint: number;
  shadowOn: boolean;
  shadowBlur: number;
  shadowOpacity: number;
};

/** Tipos de efeitos de imagem */
export type ImageEffectKind =
  | "none"
  | "grayscale"
  | "sepia"
  | "invert"
  | "blur"
  | "sharpen"
  | "vintage"
  | "cold"
  | "warm"
  | "dramatic"
  | "fade"
  | "vignette";

/** Configuração de efeitos de imagem */
export type ImageEffects = {
  kind: ImageEffectKind;
  amount: number; // 0-1 intensidade
};

type EffectEditTool = "brush" | "lasso";

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

  // ==== Imagem (níveis) ====
  getActiveImageAdjustments?: () => ImageAdjustments | null;
  applyActiveImageAdjustments?: (adj: ImageAdjustments) => Promise<void>;

  // ==== Imagem (efeitos) ====
  getActiveImageEffects?: () => ImageEffects | null;
  applyActiveImageEffects?: (fx: ImageEffects) => Promise<void>;

  // ==== Effect Brush Mode ====
  startEffectBrush?: (effectKind: ImageEffectKind, effectAmount: number, brushSize: number) => void;
  cancelEffectBrush?: () => void;
  isEffectBrushActive?: () => boolean;

  // ==== Effect Lasso Mode ====
  startEffectLasso?: (effectKind: ImageEffectKind, effectAmount: number) => void;
  cancelEffectLasso?: () => void;
  isEffectLassoActive?: () => boolean;

  // ==== Effect Edit Mode (listener) ====
  onEffectEditModeChange?: (cb: (active: boolean) => void) => void;

  // ==== Corte (crop) ====
  startSquareCrop?: () => void;
  cancelSquareCrop?: () => void;
  startLassoCrop?: () => void;
  startLassoCropReEdit?: () => void;
  canReEditLassoCrop?: () => boolean;
  cancelCrop?: () => void;
  confirmCrop?: () => void;
  isCropActive?: () => boolean;
  onCropModeChange?: (cb: (active: boolean) => void) => void;
  // Undo/redo para pontos do laço durante o corte
  undoLassoPoint?: () => boolean;
  redoLassoPoint?: () => boolean;
  canUndoLassoPoint?: () => boolean;
  canRedoLassoPoint?: () => boolean;

  // Undo/redo para o corte quadrado durante o corte
  undoSquareCropStep?: () => boolean;
  redoSquareCropStep?: () => boolean;
  canUndoSquareCropStep?: () => boolean;
  canRedoSquareCropStep?: () => boolean;

  toJSON: () => string;
  loadFromJSON: (json: string) => Promise<void>;
  deleteSelection: () => void;

  // ==== Texto ====
  addText: (value?: string, opts?: { x?: number; y?: number }) => void;
  getActiveTextStyle: () => TextStyle | null;
  setActiveTextStyle: (patch: TextStyle & { from?: "font-picker" | "inspector" }) => Promise<void>;
  applyTextStyle: (patch: TextStyle) => void;
  onSelectionChange?: (cb: (k: "none" | "text" | "image" | "other") => void) => void;

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
  /** Apenas o editor ativo deve responder a atalhos globais (Ctrl+Z/Y, Enter etc.). */
  isActive?: boolean;
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

const CANVAS_SELECTION_OPTIONS = {
  selectionColor: GIZMO_THEME.areaFill,
  selectionBorderColor: GIZMO_THEME.primary,
  selectionLineWidth: 2,
  selectionDashArray: [4, 2],
  borderColor: GIZMO_THEME.primary,
  borderDashArray: [4, 2],
  cornerColor: GIZMO_THEME.primary,
  cornerStrokeColor: GIZMO_THEME.stroke,
  cornerStyle: "circle",
  cornerSize: GIZMO_THEME.handleRadius * 2,
  cornerDashArray: [0, 0],
  transparentCorners: false,
  rotatingPointOffset: GIZMO_THEME.handleRadius * 2,
};

const getCanvasOptions = () => ({
  selection: true,
  preserveObjectStacking: true,
  ...CANVAS_SELECTION_OPTIONS,
});

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
    isActive = true,
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
  const selectionListenersRef = useRef(new Set<(k: "none" | "text" | "image" | "other") => void>());
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

  // ----------------------- corte quadrado (preview) -----------------------
  type SquareCropSnapshot = {
    cropBox: { left: number; top: number; width: number; height: number };
    img: { scaleX: number; scaleY: number };
  };

  type SquareCropSession = {
    active: boolean;
    img: any;
    imgPrev: {
      selectable?: boolean;
      evented?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
    };
    othersPrev?: Array<{
      obj: any;
      selectable?: boolean;
      evented?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
    }>;
    canvasPrev: {
      selection?: boolean;
      defaultCursor?: string;
    };
    imgOriginalCenter: { x: number; y: number };
    imgOriginalAngle: number;
    cropBox: any;
    handles: { tl: any; tr: any; bl: any; br: any };
    imgHandles: { tl: any; tr: any; bl: any; br: any };
    overlays: { top: any; bottom: any; left: any; right: any };
    highlight: any;
    size: number;
    overhang: number;
    imageRect: { left: number; top: number; width: number; height: number };

    // Stacks para undo/redo do corte quadrado durante o corte
    undoStack: SquareCropSnapshot[];
    redoStack: SquareCropSnapshot[];
    isAdjusting?: boolean;

    // Último estado gravado (para registrar cada modificação incremental)
    lastRecorded?: SquareCropSnapshot;
  };
  const squareCropRef = useRef<SquareCropSession | null>(null);
  const squareCropRecordGuardRef = useRef(0);
  const cropModeListenersRef = useRef(new Set<(active: boolean) => void>());

  const effectEditModeListenersRef = useRef(new Set<(active: boolean) => void>());

  const emitCropMode = (active: boolean) => {
    try {
      cropModeListenersRef.current.forEach((cb) => {
        try { cb(active); } catch {}
      });
    } catch {}
  };

  const emitEffectEditMode = (active: boolean) => {
    try {
      effectEditModeListenersRef.current.forEach((cb) => {
        try { cb(active); } catch {}
      });
    } catch {}
  };
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

  const isActiveRef = useRef<boolean>(isActive);
  useEffect(() => {
    isActiveRef.current = !!isActive;
  }, [isActive]);

  const imageAdjCommitTimerRef = useRef<number | null>(null);
  const wheelScaleCommitTimerRef = useRef<number | null>(null);
  const imageAdjOpIdRef = useRef(0);
  const imageAdjRunningRef = useRef(false);
  const imageAdjPendingRef = useRef<ImageAdjustments | null>(null);

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
    if (!isActive) return;
    const onGlobalKeyDown = (evt: KeyboardEvent) => {
      const c: any = canvasRef.current;
      if (!c) return;

      // Don't steal keys from form fields.
      const target = evt.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as any).isContentEditable)
      ) {
        return;
      }

      // If user is currently editing text, Enter should behave normally.
      const active: any = c.getActiveObject?.();
      const isTextEditing =
        !!active &&
        (active.isEditing === true ||
          (typeof active.enterEditing === "function" && active.hiddenTextarea));
      if (isTextEditing) return;

      // Se estiver em modo de corte, Enter confirma e Esc/Delete cancela.
      const cropSession = squareCropRef.current;
      const lassoSession = lassoCropRef.current;
      if (cropSession?.active || lassoSession?.active) {
        if (evt.key === "Enter") {
          evt.preventDefault();
          try { confirmCrop(); } catch {}
          return;
        }
        if (evt.key === "Escape" || evt.key === "Delete" || evt.key === "Backspace") {
          evt.preventDefault();
          try { cancelCrop(); } catch {}
          return;
        }
        
        const isCtrlOrMeta = evt.ctrlKey || evt.metaKey;

        // Durante o modo laço, Ctrl+Z desfaz ponto a ponto e Ctrl+Y refaz
        if (lassoSession?.active) {
          if (isCtrlOrMeta && evt.key.toLowerCase() === "z" && !evt.shiftKey) {
            evt.preventDefault();
            evt.stopPropagation();
            try { undoLassoPoint(); } catch {}
            return;
          }
          if (isCtrlOrMeta && (evt.key.toLowerCase() === "y" || (evt.key.toLowerCase() === "z" && evt.shiftKey))) {
            evt.preventDefault();
            evt.stopPropagation();
            try { redoLassoPoint(); } catch {}
            return;
          }
        }

        // Durante o modo quadrado, Ctrl+Z desfaz passo a passo e Ctrl+Y refaz
        if (cropSession?.active) {
          if (isCtrlOrMeta && evt.key.toLowerCase() === "z" && !evt.shiftKey) {
            evt.preventDefault();
            evt.stopPropagation();
            try { undoSquareCropStep(); } catch {}
            return;
          }
          if (isCtrlOrMeta && (evt.key.toLowerCase() === "y" || (evt.key.toLowerCase() === "z" && evt.shiftKey))) {
            evt.preventDefault();
            evt.stopPropagation();
            try { redoSquareCropStep(); } catch {}
            return;
          }
        }
      }

      // Delete behavior:
      // - If on select/text tools: delete current selection
      // - If any other tool is active: cancel tool usage and return to select
      if (evt.key === "Delete" || evt.key === "Backspace") {
        const activeTool = toolRef.current;

        // Curve tool: Delete/Backspace should cancel the in-progress drawing and return to select.
        // We cancel the curve state first so the tool-switch effect won't auto-finalize an open curve.
        if (activeTool === "curve") {
          evt.preventDefault();
          evt.stopPropagation();
          (evt as any).stopImmediatePropagation?.();
          try {
            clearCurvePreview(c);
          } catch {}
          try {
            resetCurveState(null);
          } catch {}
          try {
            c.requestRenderAll?.();
          } catch {}
          try {
            onRequestToolChangeRef.current?.("select");
          } catch {}
          return;
        }

        // Line tool cancellation is handled by its own keydown listener (so previews get cleaned up).
        if (activeTool === "line") {
          return;
        }

        // Brush and other drawing tools: switch back to select.
        if (activeTool !== "select" && activeTool !== "text") {
          evt.preventDefault();
          evt.stopPropagation();
          (evt as any).stopImmediatePropagation?.();
          try {
            onContinuousLineCancelRef.current?.();
          } catch {}
          try {
            onRequestToolChangeRef.current?.("select");
          } catch {}
          return;
        }

        // Select/text tools: delete selection.
        evt.preventDefault();
        evt.stopPropagation();
        (evt as any).stopImmediatePropagation?.();
        try {
          deleteSelection();
        } catch {}
        return;
      }

      if (evt.key !== "Enter") return;

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
  }, [isActive]);

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  // ---- Undo/redo do corte quadrado (snapshot) ----
  const MAX_SQUARE_CROP_UNDO = 5000;

  const getSquareCropSnapshot = (s: SquareCropSession): SquareCropSnapshot => {
    const wNow = Number(s.cropBox.width ?? s.size) || s.size;
    const hNow = Number(s.cropBox.height ?? s.size) || s.size;
    return {
      cropBox: {
        left: Number(s.cropBox.left ?? 0),
        top: Number(s.cropBox.top ?? 0),
        width: Number.isFinite(wNow) ? wNow : s.size,
        height: Number.isFinite(hNow) ? hNow : s.size,
      },
      img: {
        scaleX: Number(s.img.scaleX ?? 1) || 1,
        scaleY: Number(s.img.scaleY ?? 1) || 1,
      },
    };
  };

  const normalizeSquareCropSnapshot = (snap: SquareCropSnapshot): SquareCropSnapshot => {
    const roundScale = (v: number) => Math.round(v * 10000) / 10000;
    const w = Math.max(1, Math.round(Number(snap.cropBox.width ?? 1)));
    const h = Math.max(1, Math.round(Number(snap.cropBox.height ?? 1)));
    return {
      cropBox: {
        left: Math.round(Number(snap.cropBox.left ?? 0)),
        top: Math.round(Number(snap.cropBox.top ?? 0)),
        width: w,
        height: h,
      },
      img: {
        scaleX: roundScale(Number(snap.img.scaleX ?? 1) || 1),
        scaleY: roundScale(Number(snap.img.scaleY ?? 1) || 1),
      },
    };
  };

  const isSameSquareCropSnapshot = (a?: SquareCropSnapshot, b?: SquareCropSnapshot) => {
    if (!a || !b) return false;
    return (
      a.cropBox.left === b.cropBox.left &&
      a.cropBox.top === b.cropBox.top &&
      a.cropBox.width === b.cropBox.width &&
      a.cropBox.height === b.cropBox.height &&
      a.img.scaleX === b.img.scaleX &&
      a.img.scaleY === b.img.scaleY
    );
  };


  const applySquareCropSnapshot = (snap: SquareCropSnapshot): boolean => {
    const c: any = canvasRef.current;
    const s = squareCropRef.current;
    if (!c || !s?.active) return false;

    const normalized = normalizeSquareCropSnapshot(snap);

    squareCropRecordGuardRef.current += 1;

    runSilently(() => {
      try {
        s.img.set({ scaleX: normalized.img.scaleX, scaleY: normalized.img.scaleY });
        s.img.setCoords?.();
      } catch {}

      // Mantém o comportamento do modo de corte: imagem centralizada
      try { centerImageInCanvas(s.img); } catch {}

      try { s.imageRect = getImageRect(s.img); } catch {}

      try {
        s.cropBox.set({ left: normalized.cropBox.left, top: normalized.cropBox.top, width: normalized.cropBox.width, height: normalized.cropBox.height });
        s.cropBox.setCoords?.();
      } catch {}
    });

    updateSquareCropPreview();
    try { c.requestRenderAll?.(); } catch {}

    // updateSquareCropPreview faz clamp e pode ajustar cropBox; grave o estado real final.
    try {
      s.lastRecorded = normalizeSquareCropSnapshot(getSquareCropSnapshot(s));
    } catch {}

    squareCropRecordGuardRef.current = Math.max(0, squareCropRecordGuardRef.current - 1);
    return true;
  };

  const undoSquareCropStep = (): boolean => {
    const s = squareCropRef.current;
    if (!s?.active) return false;
    if (s.undoStack.length === 0) return false;

    if (s.lastRecorded) s.redoStack.push(s.lastRecorded);
    const prev = s.undoStack.pop()!;
    s.isAdjusting = false;
    return applySquareCropSnapshot(prev);
  };

  const redoSquareCropStep = (): boolean => {
    const s = squareCropRef.current;
    if (!s?.active) return false;
    if (s.redoStack.length === 0) return false;

    if (s.lastRecorded) s.undoStack.push(s.lastRecorded);
    const next = s.redoStack.pop()!;
    s.isAdjusting = false;
    return applySquareCropSnapshot(next);
  };

  const canUndoSquareCropStep = (): boolean => {
    const s = squareCropRef.current;
    return !!s?.active && s.undoStack.length > 0;
  };

  const canRedoSquareCropStep = (): boolean => {
    const s = squareCropRef.current;
    return !!s?.active && s.redoStack.length > 0;
  };

  const getActiveSingleImageForCrop = (): any | null => {
    const imgs = getSelectedImageObjects();
    if (imgs.length !== 1) return null;
    const img = imgs[0];
    // Evita cortar imagem dentro de grupo (primeira versão)
    if ((img as any).group) return null;
    const angle = Number((img as any).angle ?? 0);
    // Primeira versão: corte quadrado apenas sem rotação.
    if (Math.abs(angle) > 0.001) return null;
    return img;
  };

  // Pontos do laço são armazenados NORMALIZADOS (0..1) relativos ao retângulo atual da imagem (imageRect).
  // Isso garante que, ao ampliar/reduzir/mover a imagem durante o modo laço, os pontos acompanhem a imagem.
  type LassoPoint = { x: number; y: number; kind: "click" | "drag" };

  // Snapshot do estado dos pontos do laço para undo/redo durante o corte
  type LassoPointsSnapshot = {
    points: LassoPoint[];
    closed: boolean;
  };

  // Metadados armazenados na imagem cortada para permitir re-edição
  type LassoCropMetadata = {
    version: 1;
    points: LassoPoint[];
    originalImageDataUrl: string;
    originalImageRect: { left: number; top: number; width: number; height: number };
  };

  type LassoCropSession = {
    active: boolean;
    img: any;
    imgPrev: {
      selectable?: boolean;
      evented?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
    };
    othersPrev?: Array<{
      obj: any;
      selectable?: boolean;
      evented?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
    }>;
    canvasPrev: {
      selection?: boolean;
      defaultCursor?: string;
    };
    imgOriginalCenter: { x: number; y: number };
    imgOriginalAngle: number;
    imageRect: { left: number; top: number; width: number; height: number };
    highlight: any;
    overlay: any;
    stroke: any;
    imgHandles: { tl: any; tr: any; bl: any; br: any };
    points: LassoPoint[]; // canvas coords
    pointMarkers?: any[];
    closed?: boolean;
    isEditingPoint?: boolean;
    editingIndex?: number;
    isPointerDown: boolean;
    isFreehand: boolean;
    isDragging?: boolean;
    dragPoint?: { x: number; y: number };
    lastSample?: { x: number; y: number };
    downPoint?: { x: number; y: number };
    onMouseDown?: any;
    onMouseMove?: any;
    onMouseUp?: any;
    // Stacks para undo/redo dos pontos durante o corte
    undoStack: LassoPointsSnapshot[];
    redoStack: LassoPointsSnapshot[];
    // Flag para indicar se estamos re-editando um corte anterior
    isReEdit?: boolean;
    originalImageForReEdit?: any;
    originalDataUrlForReEdit?: string;
  };
  const lassoCropRef = useRef<LassoCropSession | null>(null);

  // ========== Modo Effect Brush ==========
  type EffectBrushSession = {
    active: boolean;
    img: any;
    imgPrev: {
      selectable?: boolean;
      evented?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
    };
    othersPrev?: Array<{
      obj: any;
      selectable?: boolean;
      evented?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
    }>;
    canvasPrev: {
      selection?: boolean;
      defaultCursor?: string;
    };
    imgOriginalCenter: { x: number; y: number };
    imgOriginalAngle: number;
    imageRect: { left: number; top: number; width: number; height: number };
    highlight: any;
    overlay: any;
    imgHandles: { tl: any; tr: any; bl: any; br: any };
    effectKind: ImageEffectKind;
    effectAmount: number;
    brushSize: number;

    // Base (imutável) para evitar que o efeito acumule ao passar no mesmo local.
    baseSrc?: string;
    baseAdj?: ImageAdjustments;
    baseFx?: ImageEffects;

    // Preview ao vivo
    previewPrepared?: boolean;
    previewPrepOpId?: number;
    previewUpdateOpId?: number;
    previewTimer?: number | null;
    previewApplyInFlight?: boolean;
    previewApplyPending?: boolean;
    previewCanvas?: HTMLCanvasElement;
    previewCtx?: CanvasRenderingContext2D;
    previewOutData?: ImageData;
    previewBasePixels?: Uint8ClampedArray;
    previewFxPixels?: Uint8ClampedArray;
    previewW?: number;
    previewH?: number;
    lastBakedSrc?: string;
    // Canvas offscreen para pintar a máscara de efeito
    maskCanvas?: HTMLCanvasElement;
    maskCtx?: CanvasRenderingContext2D;
    isPointerDown: boolean;
    lastPoint?: { x: number; y: number };
    onWindowMouseUp?: (ev: MouseEvent) => void;
  };
  const effectBrushRef = useRef<EffectBrushSession | null>(null);

  type EffectLassoPoint = { x: number; y: number; kind: "click" | "drag" };
  type EffectLassoSession = {
    active: boolean;
    img: any;
    imgPrev: {
      selectable?: boolean;
      evented?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
    };
    othersPrev?: Array<{
      obj: any;
      selectable?: boolean;
      evented?: boolean;
      hasControls?: boolean;
      hasBorders?: boolean;
      lockMovementX?: boolean;
      lockMovementY?: boolean;
    }>;
    canvasPrev: {
      selection?: boolean;
      defaultCursor?: string;
    };
    imgOriginalCenter: { x: number; y: number };
    imgOriginalAngle: number;
    imageRect: { left: number; top: number; width: number; height: number };
    highlight: any;
    overlay: any;
    stroke: any;
    imgHandles: { tl: any; tr: any; bl: any; br: any };
    effectKind: ImageEffectKind;
    effectAmount: number;
    points: EffectLassoPoint[];
    closed: boolean;
    isPointerDown: boolean;
    isDragging: boolean;
    dragPoint?: { x: number; y: number };
    downPoint?: { x: number; y: number };
    lastSample?: { x: number; y: number };
    onMouseDown?: any;
    onMouseMove?: any;
    onMouseUp?: any;
  };
  const effectLassoRef = useRef<EffectLassoSession | null>(null);

  const clampPointToRect = (p: { x: number; y: number }, r: { left: number; top: number; width: number; height: number }) => ({
    x: clamp(p.x, r.left, r.left + r.width),
    y: clamp(p.y, r.top, r.top + r.height),
  });

  const lassoPointToCanvas = (s: any, p: { x: number; y: number }) => {
    const r = s?.imageRect ?? { left: 0, top: 0, width: 1, height: 1 };
    const w = Math.max(1e-6, Number(r.width ?? 1) || 1);
    const h = Math.max(1e-6, Number(r.height ?? 1) || 1);
    return {
      x: Number(r.left ?? 0) + Number(p.x ?? 0) * w,
      y: Number(r.top ?? 0) + Number(p.y ?? 0) * h,
    };
  };

  const canvasPointToLasso = (s: any, p: { x: number; y: number }) => {
    const r = s?.imageRect ?? { left: 0, top: 0, width: 1, height: 1 };
    const w = Math.max(1e-6, Number(r.width ?? 1) || 1);
    const h = Math.max(1e-6, Number(r.height ?? 1) || 1);
    const u = (Number(p.x ?? 0) - Number(r.left ?? 0)) / w;
    const v = (Number(p.y ?? 0) - Number(r.top ?? 0)) / h;
    return {
      x: clamp(u, 0, 1),
      y: clamp(v, 0, 1),
    };
  };

  const exportImageWithEffectsMaskedToDataUrl = async (
    src: string,
    adj: ImageAdjustments,
    fx: ImageEffects,
    maskCanvas: HTMLCanvasElement
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas 2D não disponível"));

          // Aplica ajustes globais primeiro
          const filterCss =
            `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) ` +
            `sepia(${adj.sepia}%) grayscale(${adj.grayscale}%) hue-rotate(${adj.hue}deg)`;
          try {
            (ctx as any).filter = filterCss;
          } catch {}
          ctx.drawImage(imgEl, 0, 0);

          const kind = fx.kind ?? "none";
          const amount = typeof fx.amount === "number" ? fx.amount : 1;
          if (kind === "none" || amount <= 0) {
            resolve(canvas.toDataURL("image/png"));
            return;
          }

          // Constrói uma versão com o efeito aplicado (full) e depois mistura pelo alpha da máscara.
          const w = canvas.width;
          const h = canvas.height;
          const baseData = ctx.getImageData(0, 0, w, h);
          const fxData = ctx.getImageData(0, 0, w, h);
          const data = fxData.data;
          const clamp255 = (n: number) => Math.max(0, Math.min(255, n));

          for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            const or = r,
              og = g,
              ob = b;

            switch (kind) {
              case "grayscale": {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = g = b = gray;
                break;
              }
              case "sepia": {
                const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                r = tr;
                g = tg;
                b = tb;
                break;
              }
              case "invert": {
                r = 255 - r;
                g = 255 - g;
                b = 255 - b;
                break;
              }
              case "vintage": {
                const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                r = tr * 0.9 + 25;
                g = tg * 0.85 + 20;
                b = tb * 0.8 + 15;
                break;
              }
              case "cold": {
                r = r * 0.9;
                g = g * 0.95;
                b = b * 1.1 + 10;
                break;
              }
              case "warm": {
                r = r * 1.1 + 10;
                g = g * 1.02;
                b = b * 0.9;
                break;
              }
              case "dramatic": {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = r * 0.7 + gray * 0.3;
                g = g * 0.7 + gray * 0.3;
                b = b * 0.7 + gray * 0.3;
                r = 128 + (r - 128) * 1.4;
                g = 128 + (g - 128) * 1.4;
                b = 128 + (b - 128) * 1.4;
                break;
              }
              case "fade": {
                r = r * 0.85 + 38;
                g = g * 0.85 + 38;
                b = b * 0.85 + 38;
                break;
              }
              case "vignette":
              case "blur":
              case "sharpen":
                break;
            }

            r = or + (r - or) * amount;
            g = og + (g - og) * amount;
            b = ob + (b - ob) * amount;

            data[i] = clamp255(r);
            data[i + 1] = clamp255(g);
            data[i + 2] = clamp255(b);
          }

          if (kind === "vignette") {
            const cx = w / 2;
            const cy = h / 2;
            const maxDist = Math.sqrt(cx * cx + cy * cy);
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
                const factor = 1 - Math.pow(dist, 1.5) * 0.7 * amount;
                data[i] = clamp255(data[i] * factor);
                data[i + 1] = clamp255(data[i + 1] * factor);
                data[i + 2] = clamp255(data[i + 2] * factor);
              }
            }
          }

          if (kind === "blur" && amount > 0) {
            const radius = Math.round(amount * 5);
            if (radius > 0) {
              const srcData = new Uint8ClampedArray(data);
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  let rSum = 0,
                    gSum = 0,
                    bSum = 0,
                    count = 0;
                  for (let ddy = -radius; ddy <= radius; ddy++) {
                    const yy = y + ddy;
                    if (yy < 0 || yy >= h) continue;
                    for (let ddx = -radius; ddx <= radius; ddx++) {
                      const xx = x + ddx;
                      if (xx < 0 || xx >= w) continue;
                      const j = (yy * w + xx) * 4;
                      rSum += srcData[j];
                      gSum += srcData[j + 1];
                      bSum += srcData[j + 2];
                      count++;
                    }
                  }
                  const i = (y * w + x) * 4;
                  data[i] = rSum / count;
                  data[i + 1] = gSum / count;
                  data[i + 2] = bSum / count;
                }
              }
            }
          }

          // Máscara (alpha) - assume maskCanvas com mesmo tamanho (img pixels)
          const maskCtx = maskCanvas.getContext("2d");
          if (!maskCtx) return reject(new Error("Mask ctx inválido"));
          const mask = maskCtx.getImageData(0, 0, w, h).data;

          const out = baseData.data;
          const fxPixels = fxData.data;
          for (let i = 0; i < out.length; i += 4) {
            const a = (mask[i + 3] ?? 0) / 255;
            if (a <= 0) continue;
            const t = a; // máscara controla o blend (pintura)
            out[i] = out[i] + (fxPixels[i] - out[i]) * t;
            out[i + 1] = out[i + 1] + (fxPixels[i + 1] - out[i + 1]) * t;
            out[i + 2] = out[i + 2] + (fxPixels[i + 2] - out[i + 2]) * t;
          }

          ctx.putImageData(baseData, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      imgEl.onerror = () => reject(new Error("Falha ao carregar a imagem"));
      imgEl.src = src;
    });

  const centerImageInCanvas = (img: any) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    if (!c || !fabric || !img) return;
    runSilently(() => {
      try {
        const p = new fabric.Point(c.getWidth() / 2, c.getHeight() / 2);
        img.setPositionByOrigin?.(p, "center", "center");
        img.setCoords?.();
      } catch {}
    });
  };

  const getImageRect = (img: any) => {
    const c: any = canvasRef.current;
    if (!c || !img) return { left: 0, top: 0, width: 0, height: 0 };
    try {
      const r = img.getBoundingRect?.(true, true);
      if (r && typeof r.left === "number") return { left: r.left, top: r.top, width: r.width, height: r.height };
    } catch {}
    const left = Number(img.left ?? 0);
    const top = Number(img.top ?? 0);
    const w = Number(img.width ?? 0) * Number(img.scaleX ?? 1);
    const h = Number(img.height ?? 0) * Number(img.scaleY ?? 1);
    return { left, top, width: w, height: h };
  };

  const getObjectCenter = (obj: any) => {
    if (!obj) return { x: 0, y: 0 };
    try {
      const p = obj.getCenterPoint?.();
      if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
    } catch {}
    const r = getImageRect(obj);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const freezeImageForCrop = (img: any) => {
    const prev = {
      selectable: !!img?.selectable,
      evented: !!img?.evented,
      lockMovementX: !!img?.lockMovementX,
      lockMovementY: !!img?.lockMovementY,
      hasControls: !!img?.hasControls,
      hasBorders: !!img?.hasBorders,
    };
    runSilently(() => {
      try {
        img.set({
          selectable: false,
          evented: false,
          lockMovementX: true,
          lockMovementY: true,
          hasControls: false,
          hasBorders: false,
        });
        img.setCoords?.();
      } catch {}
    });
    return prev;
  };

  const restoreImageAfterCrop = (img: any, prev: any) => {
    if (!img) return;
    runSilently(() => {
      try {
        img.set({
          selectable: prev?.selectable,
          evented: prev?.evented,
          lockMovementX: prev?.lockMovementX,
          lockMovementY: prev?.lockMovementY,
          hasControls: prev?.hasControls,
          hasBorders: prev?.hasBorders,
        });
        img.setCoords?.();
      } catch {}
    });
  };

  const freezeOtherCanvasObjectsForCrop = (exclude: Set<any>) => {
    const c: any = canvasRef.current;
    if (!c) return [] as any[];

    const prev: any[] = [];
    let objs: any[] = [];
    try {
      const got = c.getObjects?.();
      if (Array.isArray(got)) objs = got;
    } catch {}

    runSilently(() => {
      for (const obj of objs) {
        if (!obj) continue;
        if (exclude.has(obj)) continue;
        prev.push({
          obj,
          selectable: !!obj.selectable,
          evented: !!obj.evented,
          hasControls: !!obj.hasControls,
          hasBorders: !!obj.hasBorders,
          lockMovementX: !!obj.lockMovementX,
          lockMovementY: !!obj.lockMovementY,
        });
        try {
          obj.set?.({
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            lockMovementX: true,
            lockMovementY: true,
          });
          obj.setCoords?.();
        } catch {}
      }
    });

    return prev;
  };

  const restoreOtherCanvasObjectsAfterCrop = (prev: any[] | undefined) => {
    if (!prev || !Array.isArray(prev)) return;
    runSilently(() => {
      for (const item of prev) {
        const obj = item?.obj;
        if (!obj) continue;
        try {
          obj.set?.({
            selectable: item.selectable,
            evented: item.evented,
            hasControls: item.hasControls,
            hasBorders: item.hasBorders,
            lockMovementX: item.lockMovementX,
            lockMovementY: item.lockMovementY,
          });
          obj.setCoords?.();
        } catch {}
      }
    });
  };

  const makeImageScaleHandles = (rect: { left: number; top: number; width: number; height: number }) => {
    const fabric: any = fabricRef.current;
    if (!fabric) return null;
    const handleRadius = 7;
    const handleStroke = withAlpha(GIZMO_THEME.stroke, 0.9);
    const handleFill = GIZMO_THEME.primary;
    const make = (corner: "tl" | "tr" | "bl" | "br", x: number, y: number) => {
      const h = new fabric.Circle({
        left: x,
        top: y,
        radius: handleRadius,
        originX: "center",
        originY: "center",
        fill: handleFill,
        stroke: handleStroke,
        strokeWidth: 2,
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: false,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        hoverCursor: "nwse-resize",
        excludeFromExport: true,
      });
      try { (h as any).__moldaImageScaleCorner = corner; } catch {}
      return h;
    };
    const l = rect.left;
    const t = rect.top;
    const r = rect.left + rect.width;
    const b = rect.top + rect.height;
    return {
      tl: make("tl", l, t),
      tr: make("tr", r, t),
      bl: make("bl", l, b),
      br: make("br", r, b),
    };
  };

  const replaceImageWithNewObject = (original: any, createNew: () => any) => {
    const c: any = canvasRef.current;
    if (!c || !original) return null;

    const idx = (() => {
      try {
        const arr = c.getObjects?.();
        if (Array.isArray(arr)) return arr.indexOf(original);
      } catch {}
      return -1;
    })();

    const next = createNew();
    if (!next) return null;

    runSilently(() => {
      try {
        if (idx >= 0 && typeof c.insertAt === "function") c.insertAt(next, idx, false);
        else c.add(next);
      } catch {
        try { c.add(next); } catch {}
      }
      try { c.remove(original); } catch {}
    });

    // força gizmo novo
    try { c.discardActiveObject?.(); } catch {}
    try { c.setActiveObject?.(next); } catch {}
    try { c.requestRenderAll?.(); } catch {}
    return next;
  };

  const copyBasicImageProps = (from: any, to: any) => {
    if (!from || !to) return;
    const props: any = {
      left: Number(from.left ?? 0),
      top: Number(from.top ?? 0),
      scaleX: Number(from.scaleX ?? 1),
      scaleY: Number(from.scaleY ?? 1),
      angle: Number(from.angle ?? 0),
      originX: from.originX ?? "left",
      originY: from.originY ?? "top",
      flipX: !!from.flipX,
      flipY: !!from.flipY,
      skewX: Number(from.skewX ?? 0),
      skewY: Number(from.skewY ?? 0),
      opacity: typeof from.opacity === "number" ? from.opacity : 1,
      cropX: Number(from.cropX ?? 0) || 0,
      cropY: Number(from.cropY ?? 0) || 0,
      width: typeof from.width === "number" ? from.width : undefined,
      height: typeof from.height === "number" ? from.height : undefined,
      erasable: true,
      selectable: true,
      evented: true,
      lockMovementX: false,
      lockMovementY: false,
      hasControls: true,
      hasBorders: true,
    };
    runSilently(() => {
      try { to.set?.(props); } catch {
        try {
          Object.keys(props).forEach((k) => {
            try { to[k] = props[k]; } catch {}
          });
        } catch {}
      }
      try { to.setCoords?.(); } catch {}
    });

    try {
      const src = (from as any).__moldaOriginalSrc;
      if (src) (to as any).__moldaOriginalSrc = src;
    } catch {}

    try {
      if (Array.isArray(from.filters)) {
        (to as any).filters = from.filters;
        try { (to as any).applyFilters?.(); } catch {}
      }
    } catch {}
  };

  const cleanupLassoCropPreview = (opts?: { restoreImage?: boolean }) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = lassoCropRef.current;
    if (!c || !fabric || !s) return;

    try {
      if (s.onMouseDown) c.off?.("mouse:down", s.onMouseDown);
      if (s.onMouseMove) c.off?.("mouse:move", s.onMouseMove);
      if (s.onMouseUp) c.off?.("mouse:up", s.onMouseUp);
    } catch {}

    runSilently(() => {
      try { c.remove(s.imgHandles?.tl); } catch {}
      try { c.remove(s.imgHandles?.tr); } catch {}
      try { c.remove(s.imgHandles?.bl); } catch {}
      try { c.remove(s.imgHandles?.br); } catch {}
      try {
        (s.pointMarkers ?? []).forEach((m) => {
          try { c.remove(m); } catch {}
        });
      } catch {}
      try { c.remove(s.stroke); } catch {}
      try { c.remove(s.overlay); } catch {}
      try { c.remove(s.highlight); } catch {}

      try {
        const prev = (s as any).canvasPrev;
        if (prev && typeof prev.selection === "boolean") c.selection = prev.selection;
        if (prev && typeof prev.defaultCursor === "string") c.defaultCursor = prev.defaultCursor;
      } catch {}

      try {
        restoreOtherCanvasObjectsAfterCrop(s.othersPrev);
      } catch {}

      try {
        restoreImageAfterCrop(s.img, (s as any).imgPrev);
      } catch {}

      if (opts?.restoreImage !== false) {
        try {
          const p = new fabric.Point(s.imgOriginalCenter.x, s.imgOriginalCenter.y);
          s.img.setPositionByOrigin?.(p, "center", "center");
          s.img.set({ angle: s.imgOriginalAngle });
          s.img.setCoords?.();
        } catch {}
      }
    });

    lassoCropRef.current = null;
    emitCropMode(false);
    try { c.requestRenderAll?.(); } catch {}
  };

  // ========== Effect Brush Mode ==========
  const cleanupEffectBrush = (opts?: { restoreImage?: boolean }) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = effectBrushRef.current;
    if (!c || !fabric || !s) return;

    try {
      if (s.onWindowMouseUp) window.removeEventListener("mouseup", s.onWindowMouseUp);
    } catch {}

    try {
      if (s.previewTimer != null) window.clearTimeout(s.previewTimer);
    } catch {}

    try {
      if ((s as any).onMouseDown) c.off?.("mouse:down", (s as any).onMouseDown);
      if ((s as any).onMouseMove) c.off?.("mouse:move", (s as any).onMouseMove);
      if ((s as any).onMouseUp) c.off?.("mouse:up", (s as any).onMouseUp);
    } catch {}

    runSilently(() => {
      // Persistência do resultado final do pincel: salva como nova origem apenas ao sair do modo.
      try {
        if (s.lastBakedSrc) {
          (s.img as any).__moldaOriginalSrc = s.lastBakedSrc;
          try { delete (s.img as any).__moldaImageEffects; } catch {}
        }
      } catch {}

      try { c.remove(s.imgHandles?.tl); } catch {}
      try { c.remove(s.imgHandles?.tr); } catch {}
      try { c.remove(s.imgHandles?.bl); } catch {}
      try { c.remove(s.imgHandles?.br); } catch {}
      try { c.remove(s.overlay); } catch {}
      try { c.remove(s.highlight); } catch {}

      try {
        const prev = s.canvasPrev;
        if (prev && typeof prev.selection === "boolean") c.selection = prev.selection;
        if (prev && typeof prev.defaultCursor === "string") c.defaultCursor = prev.defaultCursor;
      } catch {}

      try {
        restoreOtherCanvasObjectsAfterCrop(s.othersPrev);
      } catch {}

      try {
        restoreImageAfterCrop(s.img, s.imgPrev);
      } catch {}

      if (opts?.restoreImage !== false) {
        try {
          const p = new fabric.Point(s.imgOriginalCenter.x, s.imgOriginalCenter.y);
          s.img.setPositionByOrigin?.(p, "center", "center");
          s.img.set({ angle: s.imgOriginalAngle });
          s.img.setCoords?.();
        } catch {}
      }
    });

    effectBrushRef.current = null;
    try {
      const anyActive = !!effectBrushRef.current?.active || !!effectLassoRef.current?.active;
      emitEffectEditMode(anyActive);
    } catch {}
    try { c.requestRenderAll?.(); } catch {}
  };

  const cleanupEffectLasso = (opts?: { restoreImage?: boolean }) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = effectLassoRef.current;
    if (!c || !fabric || !s) return;

    try {
      if (s.onMouseDown) c.off?.("mouse:down", s.onMouseDown);
      if (s.onMouseMove) c.off?.("mouse:move", s.onMouseMove);
      if (s.onMouseUp) c.off?.("mouse:up", s.onMouseUp);
    } catch {}

    runSilently(() => {
      try { c.remove(s.imgHandles?.tl); } catch {}
      try { c.remove(s.imgHandles?.tr); } catch {}
      try { c.remove(s.imgHandles?.bl); } catch {}
      try { c.remove(s.imgHandles?.br); } catch {}
      try { c.remove(s.stroke); } catch {}
      try { c.remove(s.overlay); } catch {}
      try { c.remove(s.highlight); } catch {}

      try {
        const prev = s.canvasPrev;
        if (prev && typeof prev.selection === "boolean") c.selection = prev.selection;
        if (prev && typeof prev.defaultCursor === "string") c.defaultCursor = prev.defaultCursor;
      } catch {}

      try {
        restoreOtherCanvasObjectsAfterCrop(s.othersPrev);
      } catch {}

      try {
        restoreImageAfterCrop(s.img, s.imgPrev);
      } catch {}

      if (opts?.restoreImage !== false) {
        try {
          const p = new fabric.Point(s.imgOriginalCenter.x, s.imgOriginalCenter.y);
          s.img.setPositionByOrigin?.(p, "center", "center");
          s.img.set({ angle: s.imgOriginalAngle });
          s.img.setCoords?.();
        } catch {}
      }
    });

    effectLassoRef.current = null;
    try {
      const anyActive = !!effectBrushRef.current?.active || !!effectLassoRef.current?.active;
      emitEffectEditMode(anyActive);
    } catch {}
    try { c.requestRenderAll?.(); } catch {}
  };

  const startEffectBrush = (effectKind: ImageEffectKind, effectAmount: number, brushSize: number) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    if (!c || !fabric) return;

    const existingImg = effectBrushRef.current?.img || effectLassoRef.current?.img;

    // Limpa outros modos
    cleanupSquareCropPreview({ restoreImage: true });
    cleanupLassoCropPreview({ restoreImage: true });
    cleanupEffectBrush({ restoreImage: true });
    cleanupEffectLasso({ restoreImage: true });

    const img = existingImg ?? getActiveSingleImageForCrop();
    if (!img) return;

    const resolveOriginalSrc = (): string | undefined => {
      try {
        const s: any = effectBrushRef.current;
        if (s?.baseSrc) return String(s.baseSrc);
      } catch {}
      return (
        (img as any).__moldaOriginalSrc ||
        (typeof img?.getSrc === "function" ? img.getSrc() : undefined) ||
        img?._originalElement?.src ||
        img?._element?.src
      );
    };

    const originalSrc = resolveOriginalSrc();
    if (!originalSrc) return;

    const adj: ImageAdjustments = (() => {
      const saved = (img as any).__moldaImageAdjustments as ImageAdjustments | undefined;
      return saved ? { ...DEFAULT_IMAGE_ADJ, ...saved } : { ...DEFAULT_IMAGE_ADJ };
    })();

    const originalCenter = (() => {
      try {
        const p = img.getCenterPoint?.();
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: (c.getWidth?.() ?? 0) / 2, y: (c.getHeight?.() ?? 0) / 2 };
    })();
    const originalAngle = Number(img.angle ?? 0);

    // Evita que a imagem seja arrastada durante o modo brush.
    const imgPrev = freezeImageForCrop(img);

    // Evita o retângulo de seleção do Fabric enquanto pinta.
    const canvasPrev = { selection: !!c.selection, defaultCursor: String(c.defaultCursor ?? "") };
    try { c.selection = false; } catch {}
    try {
      const size = Math.max(8, Math.min(128, Math.round(Number(brushSize) || 24)));
      const stroke = 2;
      const r = Math.max(1, size / 2 - stroke);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="white" stroke-width="${stroke}"/>` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(1, r - 1)}" fill="none" stroke="black" stroke-width="1" opacity="0.7"/>` +
        `</svg>`;
      const encoded = encodeURIComponent(svg)
        .replace(/'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
      c.defaultCursor = `url("data:image/svg+xml,${encoded}") ${size / 2} ${size / 2}, crosshair`;
    } catch {
      try { c.defaultCursor = "crosshair"; } catch {}
    }

    // Centraliza temporariamente a imagem no canvas.
    runSilently(() => {
      try {
        const p = new fabric.Point(c.getWidth() / 2, c.getHeight() / 2);
        img.setPositionByOrigin?.(p, "center", "center");
        img.setCoords?.();
      } catch {}
    });

    const imageRect = (() => {
      try {
        const r = img.getBoundingRect?.(true, true);
        if (r && typeof r.left === "number") return { left: r.left, top: r.top, width: r.width, height: r.height };
      } catch {}
      const left = Number(img.left ?? 0);
      const top = Number(img.top ?? 0);
      const w = Number(img.width ?? 0) * Number(img.scaleX ?? 1);
      const h = Number(img.height ?? 0) * Number(img.scaleY ?? 1);
      return { left, top, width: w, height: h };
    })();

    const imgHandles = makeImageScaleHandles(imageRect);
    if (!imgHandles) return;

    const overlay = new fabric.Rect({
      left: 0,
      top: 0,
      width: Number(c.getWidth?.() ?? 0) || 0,
      height: Number(c.getHeight?.() ?? 0) || 0,
      fill: "rgba(0,0,0,0.55)",
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    const highlight = new fabric.Rect({
      left: imageRect.left,
      top: imageRect.top,
      width: imageRect.width,
      height: imageRect.height,
      fill: "rgba(0,0,0,0)",
      stroke: withAlpha(GIZMO_THEME.primary, 0.8),
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    runSilently(() => {
      try { c.add(overlay); } catch {}
      try { c.add(highlight); } catch {}
      try { c.add(imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br); } catch {}
      try {
        highlight.bringToFront?.();
        imgHandles.tl.bringToFront?.();
        imgHandles.tr.bringToFront?.();
        imgHandles.bl.bringToFront?.();
        imgHandles.br.bringToFront?.();
      } catch {}
    });

    const session: EffectBrushSession = {
      active: true,
      img,
      imgPrev,
      canvasPrev,
      imgOriginalCenter: originalCenter,
      imgOriginalAngle: originalAngle,
      imageRect,
      highlight,
      overlay,
      imgHandles,
      effectKind,
      effectAmount,
      brushSize,

      baseSrc: originalSrc,
      baseAdj: adj,
      baseFx: { kind: effectKind, amount: effectAmount },

      isPointerDown: false,
    };

    try {
      const exclude = new Set<any>([img, overlay, highlight, imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br]);
      session.othersPrev = freezeOtherCanvasObjectsForCrop(exclude);
    } catch {}

    effectBrushRef.current = session;

    try { emitEffectEditMode(true); } catch {}

    // mask canvas (image pixel space)
    try {
      const w = Math.max(1, Math.round(Number(img.width ?? 1) || 1));
      const h = Math.max(1, Math.round(Number(img.height ?? 1) || 1));
      const mc = document.createElement("canvas");
      mc.width = w;
      mc.height = h;
      const mctx = mc.getContext("2d");
      if (mctx) {
        mctx.clearRect(0, 0, w, h);
        (session as any).maskCanvas = mc;
        (session as any).maskCtx = mctx;
      }
    } catch {}

    const preparePreviewOnce = async () => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      if (s.previewPrepared) return;
      const opId = (s.previewPrepOpId ?? 0) + 1;
      s.previewPrepOpId = opId;

      const src = s.baseSrc;
      const adjLocal = s.baseAdj;
      const fxLocal = s.baseFx;
      if (!src || !adjLocal || !fxLocal) return;

      try {
        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
          imgEl.onload = () => resolve(imgEl);
          imgEl.onerror = () => reject(new Error("Falha ao carregar a imagem"));
          imgEl.src = src;
        });

        const w = loaded.naturalWidth;
        const h = loaded.naturalHeight;

        // A máscara precisa ter a mesma resolução (px) do preview, senão getImageData(w,h) falha e nada aparece.
        try {
          const s2 = effectBrushRef.current;
          if (s2?.active && s2.maskCanvas && (s2.maskCanvas.width !== w || s2.maskCanvas.height !== h)) {
            const nextMask = document.createElement("canvas");
            nextMask.width = w;
            nextMask.height = h;
            const nextCtx = nextMask.getContext("2d");
            if (nextCtx) {
              nextCtx.clearRect(0, 0, w, h);
              nextCtx.drawImage(s2.maskCanvas, 0, 0, w, h);
              s2.maskCanvas = nextMask;
              s2.maskCtx = nextCtx;
            }
          }
        } catch {}

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const filterCss =
          `brightness(${adjLocal.brightness}%) contrast(${adjLocal.contrast}%) saturate(${adjLocal.saturation}%) ` +
          `sepia(${adjLocal.sepia}%) grayscale(${adjLocal.grayscale}%) hue-rotate(${adjLocal.hue}deg)`;
        try {
          (ctx as any).filter = filterCss;
        } catch {}
        ctx.drawImage(loaded, 0, 0);

        // Base pixels (ajustes aplicados)
        const baseData = ctx.getImageData(0, 0, w, h);
        const basePixels = new Uint8ClampedArray(baseData.data);

        // Efeito full (aplicado uma vez)
        const fxData = ctx.getImageData(0, 0, w, h);
        const data = fxData.data;
        const kind = fxLocal.kind ?? "none";
        const amount = typeof fxLocal.amount === "number" ? fxLocal.amount : 1;
        const clamp255 = (n: number) => Math.max(0, Math.min(255, n));

        if (!(kind === "none" || amount <= 0)) {
          for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            const or = r,
              og = g,
              ob = b;

            switch (kind) {
              case "grayscale": {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = g = b = gray;
                break;
              }
              case "sepia": {
                const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                r = tr;
                g = tg;
                b = tb;
                break;
              }
              case "invert": {
                r = 255 - r;
                g = 255 - g;
                b = 255 - b;
                break;
              }
              case "vintage": {
                const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                r = tr * 0.9 + 25;
                g = tg * 0.85 + 20;
                b = tb * 0.8 + 15;
                break;
              }
              case "cold": {
                r = r * 0.9;
                g = g * 0.95;
                b = b * 1.1 + 10;
                break;
              }
              case "warm": {
                r = r * 1.1 + 10;
                g = g * 1.02;
                b = b * 0.9;
                break;
              }
              case "dramatic": {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = r * 0.7 + gray * 0.3;
                g = g * 0.7 + gray * 0.3;
                b = b * 0.7 + gray * 0.3;
                r = 128 + (r - 128) * 1.4;
                g = 128 + (g - 128) * 1.4;
                b = 128 + (b - 128) * 1.4;
                break;
              }
              case "fade": {
                r = r * 0.85 + 38;
                g = g * 0.85 + 38;
                b = b * 0.85 + 38;
                break;
              }
              case "vignette":
              case "blur":
              case "sharpen":
                break;
            }

            r = or + (r - or) * amount;
            g = og + (g - og) * amount;
            b = ob + (b - ob) * amount;

            data[i] = clamp255(r);
            data[i + 1] = clamp255(g);
            data[i + 2] = clamp255(b);
          }

          if (kind === "vignette") {
            const cx = w / 2;
            const cy = h / 2;
            const maxDist = Math.sqrt(cx * cx + cy * cy);
            for (let yy = 0; yy < h; yy++) {
              for (let xx = 0; xx < w; xx++) {
                const i = (yy * w + xx) * 4;
                const dx = xx - cx;
                const dy = yy - cy;
                const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
                const factor = 1 - Math.pow(dist, 1.5) * 0.7 * amount;
                data[i] = clamp255(data[i] * factor);
                data[i + 1] = clamp255(data[i + 1] * factor);
                data[i + 2] = clamp255(data[i + 2] * factor);
              }
            }
          }

          if (kind === "blur" && amount > 0) {
            const radius = Math.round(amount * 5);
            if (radius > 0) {
              const srcData = new Uint8ClampedArray(data);
              for (let yy = 0; yy < h; yy++) {
                for (let xx = 0; xx < w; xx++) {
                  let rSum = 0,
                    gSum = 0,
                    bSum = 0,
                    count = 0;
                  for (let ddy = -radius; ddy <= radius; ddy++) {
                    const yyy = yy + ddy;
                    if (yyy < 0 || yyy >= h) continue;
                    for (let ddx = -radius; ddx <= radius; ddx++) {
                      const xxx = xx + ddx;
                      if (xxx < 0 || xxx >= w) continue;
                      const j = (yyy * w + xxx) * 4;
                      rSum += srcData[j];
                      gSum += srcData[j + 1];
                      bSum += srcData[j + 2];
                      count++;
                    }
                  }
                  const i = (yy * w + xx) * 4;
                  data[i] = rSum / count;
                  data[i + 1] = gSum / count;
                  data[i + 2] = bSum / count;
                }
              }
            }
          }
        }

        const fxPixels = new Uint8ClampedArray(fxData.data);

        // Confere se a sessão ainda é a mesma
        const current = effectBrushRef.current;
        if (!current?.active) return;
        if (current.previewPrepOpId !== opId) return;

        current.previewCanvas = canvas;
        current.previewCtx = ctx;
        current.previewOutData = ctx.createImageData(w, h);
        current.previewBasePixels = basePixels;
        current.previewFxPixels = fxPixels;
        current.previewW = w;
        current.previewH = h;
        current.previewPrepared = true;
      } catch {
        // fallback silencioso
      }
    };

    const schedulePreviewUpdate = () => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      // throttle: se já existe timer, apenas marca pending (NÃO incremente contadores aqui,
      // senão o callback do timer fica "stale" e nunca aplica durante o drag)
      if (s.previewTimer != null) {
        s.previewApplyPending = true;
        return;
      }

      s.previewUpdateOpId = (s.previewUpdateOpId ?? 0) + 1;

      const applyOnce = async () => {
        const cur = effectBrushRef.current;
        if (!cur?.active) return;

        if (!cur.previewPrepared) {
          await preparePreviewOnce();
        }

        const pc = cur.previewCanvas;
        const pctx = cur.previewCtx;
        const outData = cur.previewOutData;
        const basePixels = cur.previewBasePixels;
        const fxPixels = cur.previewFxPixels;
        const w = cur.previewW;
        const h = cur.previewH;
        const maskCtx = cur.maskCtx;

        if (!pc || !pctx || !outData || !basePixels || !fxPixels || !w || !h || !maskCtx) return;

        // Evita concorrência: uma aplicação por vez. Se vier update no meio, marca pending.
        if (cur.previewApplyInFlight) {
          cur.previewApplyPending = true;
          return;
        }
        cur.previewApplyInFlight = true;

        try {
          const mask = maskCtx.getImageData(0, 0, w, h).data;
          const outPixels = outData.data;
          outPixels.set(basePixels);
          for (let i = 0; i < outPixels.length; i += 4) {
            const a = (mask[i + 3] ?? 0) / 255;
            if (a <= 0) continue;
            const t = a;
            outPixels[i] = outPixels[i] + (fxPixels[i] - outPixels[i]) * t;
            outPixels[i + 1] = outPixels[i + 1] + (fxPixels[i + 1] - outPixels[i + 1]) * t;
            outPixels[i + 2] = outPixels[i + 2] + (fxPixels[i + 2] - outPixels[i + 2]) * t;
          }
          pctx.putImageData(outData, 0, 0);
          const dataUrl = pc.toDataURL("image/png");

          await new Promise<void>((resolve) => {
            cur.img.setSrc(
              dataUrl,
              () => {
                try { c.requestRenderAll?.(); } catch {}
                resolve();
              },
              { crossOrigin: "anonymous" }
            );
          });
          cur.lastBakedSrc = dataUrl;
        } catch {
          // fallback silencioso
        } finally {
          cur.previewApplyInFlight = false;
        }
      };

      s.previewTimer = window.setTimeout(async () => {
        const cur = effectBrushRef.current;
        if (!cur?.active) return;
        cur.previewTimer = null;

        await applyOnce();

        // Se o usuário continua arrastando (ou eventos chegaram durante o timer), roda outro ciclo.
        if (cur.previewApplyPending || cur.isPointerDown) {
          cur.previewApplyPending = false;
          schedulePreviewUpdate();
        }
      }, 45);
    };

    // Handlers para redimensionar a imagem (como no laço)
    const refreshFromImage = () => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      s.imageRect = getImageRect(s.img);
      runSilently(() => {
        try {
          s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
          s.highlight.setCoords?.();
        } catch {}
        try {
          const l = s.imageRect.left;
          const t = s.imageRect.top;
          const r = s.imageRect.left + s.imageRect.width;
          const b = s.imageRect.top + s.imageRect.height;
          s.imgHandles.tl.set({ left: l, top: t });
          s.imgHandles.tr.set({ left: r, top: t });
          s.imgHandles.bl.set({ left: l, top: b });
          s.imgHandles.br.set({ left: r, top: b });
          s.imgHandles.tl.setCoords?.();
          s.imgHandles.tr.setCoords?.();
          s.imgHandles.bl.setCoords?.();
          s.imgHandles.br.setCoords?.();
        } catch {}
      });
      try { c.requestRenderAll?.(); } catch {}
    };

    const onImgHandleMoving = (h: any) => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      const p = h.getCenterPoint?.() ?? { x: Number(h.left ?? 0), y: Number(h.top ?? 0) };
      const canvasCenter = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
      const dx = Math.abs(Number(p.x ?? 0) - canvasCenter.x);
      const dy = Math.abs(Number(p.y ?? 0) - canvasCenter.y);
      const desiredHalfW = Math.max(16, dx);
      const desiredHalfH = Math.max(16, dy);
      const baseW = Math.max(1, Number(s.img.width ?? 0) || 1);
      const baseH = Math.max(1, Number(s.img.height ?? 0) || 1);
      const sx = (2 * desiredHalfW) / baseW;
      const sy = (2 * desiredHalfH) / baseH;
      const nextScale = clamp(Math.max(sx, sy), 0.05, 20);
      runSilently(() => {
        try {
          s.img.set({ scaleX: nextScale, scaleY: nextScale });
          centerImageInCanvas(s.img);
          s.img.setCoords?.();
        } catch {}
      });
      refreshFromImage();
    };

    imgHandles.tl.on?.("moving", () => onImgHandleMoving(imgHandles.tl));
    imgHandles.tr.on?.("moving", () => onImgHandleMoving(imgHandles.tr));
    imgHandles.bl.on?.("moving", () => onImgHandleMoving(imgHandles.bl));
    imgHandles.br.on?.("moving", () => onImgHandleMoving(imgHandles.br));

    const getPointer = (opt: any) => {
      try {
        const p = c.getPointer?.(opt.e);
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: 0, y: 0 };
    };

    const canvasToImagePixel = (pCanvas: { x: number; y: number }) => {
      // Prefer: invert object transform matrix. This stays aligned under zoom/pan/scale/rotation.
      try {
        const w = Math.max(1, Number(img.width ?? 0) || 1);
        const h = Math.max(1, Number(img.height ?? 0) || 1);
        const pt = new fabric.Point(pCanvas.x, pCanvas.y);

        if (fabric?.util?.invertTransform && fabric?.util?.transformPoint && typeof img?.calcTransformMatrix === "function") {
          const inv = fabric.util.invertTransform(img.calcTransformMatrix());
          const local = fabric.util.transformPoint(pt, inv);
          // Fabric's object plane is centered at (0,0). Convert to top-left pixel space.
          return { x: Number(local.x ?? 0) + w / 2, y: Number(local.y ?? 0) + h / 2 };
        }
      } catch {}

      // Fallback: normalize within bounding rect (works best when not rotated)
      const r = getImageRect(img);
      const u = (pCanvas.x - r.left) / Math.max(1e-6, r.width);
      const v = (pCanvas.y - r.top) / Math.max(1e-6, r.height);
      return { x: u * Number(img.width ?? 1), y: v * Number(img.height ?? 1) };
    };

    const drawBrush = (pCanvas: { x: number; y: number }) => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      const mctx = s.maskCtx;
      const mc = s.maskCanvas;
      if (!mctx || !mc) return;
      const pObj = canvasToImagePixel(pCanvas);
      const objW = Math.max(1e-6, Number(img.width ?? 1) || 1);
      const objH = Math.max(1e-6, Number(img.height ?? 1) || 1);
      // Remapeia coord do objeto (px) para coord da máscara (px)
      const p = {
        x: (pObj.x / objW) * mc.width,
        y: (pObj.y / objH) * mc.height,
      };
      const w = mc.width;
      const h = mc.height;
      if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return;
      const scale = Math.max(1e-6, Number(img.scaleX ?? 1) || 1);
      // raio em px do objeto -> px da máscara
      const radiusObj = Math.max(1, (s.brushSize / 2) / scale);
      const radius = radiusObj * (mc.width / objW);
      mctx.fillStyle = "rgba(255,255,255,1)";
      mctx.beginPath();
      mctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      mctx.fill();
    };

    const drawBrushLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(2, s.brushSize * 0.25);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        drawBrush({ x: from.x + dx * t, y: from.y + dy * t });
      }
    };

    const commitMaskToImage = async () => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      // No modo novo, o preview já aplica o resultado ao vivo. No mouseup, só garantimos uma última atualização e registramos histórico.
      try {
        await preparePreviewOnce();

        // força 1 update imediato (sem depender do throttle)
        const cur = effectBrushRef.current;
        const pc = cur?.previewCanvas;
        const pctx = cur?.previewCtx;
        const outData = cur?.previewOutData;
        const basePixels = cur?.previewBasePixels;
        const fxPixels = cur?.previewFxPixels;
        const w = cur?.previewW;
        const h = cur?.previewH;
        const maskCtx = cur?.maskCtx;

        if (cur?.active && pc && pctx && outData && basePixels && fxPixels && w && h && maskCtx) {
          try {
            const mask = maskCtx.getImageData(0, 0, w, h).data;
            const outPixels = outData.data;
            outPixels.set(basePixels);
            for (let i = 0; i < outPixels.length; i += 4) {
              const a = (mask[i + 3] ?? 0) / 255;
              if (a <= 0) continue;
              const t = a;
              outPixels[i] = outPixels[i] + (fxPixels[i] - outPixels[i]) * t;
              outPixels[i + 1] = outPixels[i + 1] + (fxPixels[i + 1] - outPixels[i + 1]) * t;
              outPixels[i + 2] = outPixels[i + 2] + (fxPixels[i + 2] - outPixels[i + 2]) * t;
            }
            pctx.putImageData(outData, 0, 0);
            const dataUrl = pc.toDataURL("image/png");
            await new Promise<void>((resolve) => {
              cur.img.setSrc(
                dataUrl,
                () => {
                  try { c.requestRenderAll?.(); } catch {}
                  resolve();
                },
                { crossOrigin: "anonymous" }
              );
            });
            cur.lastBakedSrc = dataUrl;
          } catch {
            // se falhar, tenta pelo caminho normal do throttle
            schedulePreviewUpdate();
          }
        } else {
          schedulePreviewUpdate();
        }
      } catch {}

      if (shouldRecordHistory()) {
        historyRef.current?.push("image-effect-brush");
        emitHistory();
      }
    };

    (session as any).onMouseDown = (opt: any) => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      const t = (opt as any)?.target;
      if (t && (t as any).__moldaImageScaleCorner != null) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      s.isPointerDown = true;
      const p = getPointer(opt);
      s.lastPoint = p;
      drawBrush(p);
      // começa a preparar o preview o quanto antes
      try { void preparePreviewOnce(); } catch {}
      schedulePreviewUpdate();
      try { c.requestRenderAll?.(); } catch {}
    };

    (session as any).onMouseMove = (opt: any) => {
      const s = effectBrushRef.current;
      if (!s?.active || !s.isPointerDown) return;
      const t = (opt as any)?.target;
      if (t && (t as any).__moldaImageScaleCorner != null) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      const p = getPointer(opt);
      const last = s.lastPoint;
      if (last) drawBrushLine(last, p);
      s.lastPoint = p;
      schedulePreviewUpdate();
    };

    (session as any).onMouseUp = async (opt: any) => {
      const s = effectBrushRef.current;
      if (!s?.active) return;
      const t = (opt as any)?.target;
      if (t && (t as any).__moldaImageScaleCorner != null) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      if (!s.isPointerDown) return;
      s.isPointerDown = false;
      s.lastPoint = undefined;
      await commitMaskToImage();
    };

    try {
      c.on?.("mouse:down", (session as any).onMouseDown);
      c.on?.("mouse:move", (session as any).onMouseMove);
      c.on?.("mouse:up", (session as any).onMouseUp);
    } catch {}

    // Garante commit mesmo se soltar o mouse fora do canvas.
    try {
      const onWindowMouseUp = async () => {
        const s = effectBrushRef.current;
        if (!s?.active || !s.isPointerDown) return;
        s.isPointerDown = false;
        s.lastPoint = undefined;
        await commitMaskToImage();
      };
      session.onWindowMouseUp = onWindowMouseUp;
      window.addEventListener("mouseup", onWindowMouseUp);
    } catch {}

    try { c.requestRenderAll?.(); } catch {}
  };

  const cancelEffectBrush = () => {
    cleanupEffectBrush({ restoreImage: true });
  };

  const isEffectBrushActive = (): boolean => {
    return !!effectBrushRef.current?.active;
  };

  const startEffectLasso = (effectKind: ImageEffectKind, effectAmount: number) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    if (!c || !fabric) return;

    const existingImg = effectBrushRef.current?.img || effectLassoRef.current?.img;

    cleanupSquareCropPreview({ restoreImage: true });
    cleanupLassoCropPreview({ restoreImage: true });
    cleanupEffectBrush({ restoreImage: true });
    cleanupEffectLasso({ restoreImage: true });

    const img = existingImg ?? getActiveSingleImageForCrop();
    if (!img) return;

    const originalCenter = (() => {
      try {
        const p = img.getCenterPoint?.();
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: (c.getWidth?.() ?? 0) / 2, y: (c.getHeight?.() ?? 0) / 2 };
    })();
    const originalAngle = Number(img.angle ?? 0);

    const imgPrev = freezeImageForCrop(img);
    const canvasPrev = { selection: !!c.selection, defaultCursor: String(c.defaultCursor ?? "") };
    try { c.selection = false; } catch {}
    try { c.defaultCursor = "crosshair"; } catch {}

    runSilently(() => {
      try {
        const p = new fabric.Point(c.getWidth() / 2, c.getHeight() / 2);
        img.setPositionByOrigin?.(p, "center", "center");
        img.setCoords?.();
      } catch {}
    });

    const imageRect = getImageRect(img);
    const imgHandles = makeImageScaleHandles(imageRect);
    if (!imgHandles) return;

    const overlay = new fabric.Rect({
      left: 0,
      top: 0,
      width: Number(c.getWidth?.() ?? 0) || 0,
      height: Number(c.getHeight?.() ?? 0) || 0,
      fill: "rgba(0,0,0,0.55)",
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    const highlight = new fabric.Rect({
      left: imageRect.left,
      top: imageRect.top,
      width: imageRect.width,
      height: imageRect.height,
      fill: "rgba(0,0,0,0)",
      stroke: withAlpha(GIZMO_THEME.primary, 0.8),
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    const stroke = new fabric.Polyline([], {
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      stroke: GIZMO_THEME.primary,
      strokeWidth: 2,
      fill: "rgba(0,0,0,0)",
      objectCaching: false,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    runSilently(() => {
      try { c.add(overlay); } catch {}
      try { c.add(highlight); } catch {}
      try { c.add(imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br); } catch {}
      try { c.add(stroke); } catch {}
      try {
        highlight.bringToFront?.();
        imgHandles.tl.bringToFront?.();
        imgHandles.tr.bringToFront?.();
        imgHandles.bl.bringToFront?.();
        imgHandles.br.bringToFront?.();
        stroke.bringToFront?.();
      } catch {}
    });

    const session: EffectLassoSession = {
      active: true,
      img,
      imgPrev,
      canvasPrev,
      imgOriginalCenter: originalCenter,
      imgOriginalAngle: originalAngle,
      imageRect,
      highlight,
      overlay,
      stroke,
      imgHandles,
      effectKind,
      effectAmount,
      points: [],
      closed: false,
      isPointerDown: false,
      isDragging: false,
    };

    try {
      const exclude = new Set<any>([img, overlay, highlight, stroke, imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br]);
      session.othersPrev = freezeOtherCanvasObjectsForCrop(exclude);
    } catch {}

    effectLassoRef.current = session;

    try { emitEffectEditMode(true); } catch {}

    const getPointer = (opt: any) => {
      try {
        const p = c.getPointer?.(opt.e);
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: 0, y: 0 };
    };

    const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    };
    const isNear = (a: { x: number; y: number }, b: { x: number; y: number }, radius: number) => dist2(a, b) <= radius * radius;

    const updateEffectLassoGraphics = () => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      const pts = s.points;
      const basePts = pts.map((p) => lassoPointToCanvas(s, p));
      const strokePts: Array<{ x: number; y: number }> = (() => {
        if (s.isPointerDown && s.isDragging && s.dragPoint) {
          const base = basePts.slice();
          if (base.length === 0 && s.downPoint) base.push(lassoPointToCanvas(s, s.downPoint));
          const d = lassoPointToCanvas(s, s.dragPoint);
          base.push({ x: d.x, y: d.y });
          if (s.closed && base.length >= 3) base.push(base[0]);
          return base;
        }
        const base = basePts.slice();
        if (s.closed && base.length >= 3) base.push(base[0]);
        return base;
      })();
      runSilently(() => {
        try { s.stroke.set({ points: strokePts }); } catch {}
        try { s.stroke.setCoords?.(); } catch {}
      });
      try { c.requestRenderAll?.(); } catch {}
    };

    const confirmEffectLasso = async () => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      if (!s.closed || s.points.length < 3) return;

      // mask canvas in image pixel space
      const w = Math.max(1, Math.round(Number(s.img.width ?? 1) || 1));
      const h = Math.max(1, Math.round(Number(s.img.height ?? 1) || 1));
      const mc = document.createElement("canvas");
      mc.width = w;
      mc.height = h;
      const mctx = mc.getContext("2d");
      if (!mctx) return;
      mctx.clearRect(0, 0, w, h);

      // pontos normalizados (0..1) -> pixels (assumindo imagem não-rotacionada durante edição)
      const poly = s.points.map((p) => ({ x: clamp(p.x, 0, 1) * w, y: clamp(p.y, 0, 1) * h }));
      mctx.fillStyle = "rgba(255,255,255,1)";
      mctx.beginPath();
      mctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) mctx.lineTo(poly[i].x, poly[i].y);
      mctx.closePath();
      mctx.fill();

      const originalSrc: string | undefined =
        (s.img as any).__moldaOriginalSrc || s.img?._originalElement?.src || s.img?._element?.src;
      if (!originalSrc) return;

      const adj: ImageAdjustments = (() => {
        const saved = (s.img as any).__moldaImageAdjustments as ImageAdjustments | undefined;
        return saved ? { ...DEFAULT_IMAGE_ADJ, ...saved } : { ...DEFAULT_IMAGE_ADJ };
      })();

      try {
        const dataUrl = await exportImageWithEffectsMaskedToDataUrl(
          originalSrc,
          adj,
          { kind: s.effectKind, amount: s.effectAmount },
          mc
        );

        await new Promise<void>((resolve) => {
          s.img.setSrc(
            dataUrl,
            () => {
              try { c.requestRenderAll?.(); } catch {}
              resolve();
            },
            { crossOrigin: "anonymous" }
          );
        });

        try { (s.img as any).__moldaOriginalSrc = dataUrl; } catch {}
        try { delete (s.img as any).__moldaImageEffects; } catch {}
      } catch {}

      if (shouldRecordHistory()) {
        historyRef.current?.push("image-effect-lasso");
        emitHistory();
      }

      cleanupEffectLasso({ restoreImage: true });
    };

    const refreshFromImage = () => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      s.imageRect = getImageRect(s.img);
      runSilently(() => {
        try {
          s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
          s.highlight.setCoords?.();
        } catch {}
        try {
          const l = s.imageRect.left;
          const t = s.imageRect.top;
          const r = s.imageRect.left + s.imageRect.width;
          const b = s.imageRect.top + s.imageRect.height;
          s.imgHandles.tl.set({ left: l, top: t });
          s.imgHandles.tr.set({ left: r, top: t });
          s.imgHandles.bl.set({ left: l, top: b });
          s.imgHandles.br.set({ left: r, top: b });
          s.imgHandles.tl.setCoords?.();
          s.imgHandles.tr.setCoords?.();
          s.imgHandles.bl.setCoords?.();
          s.imgHandles.br.setCoords?.();
        } catch {}
      });
      updateEffectLassoGraphics();
    };

    const onImgHandleMoving = (h: any) => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      const p = h.getCenterPoint?.() ?? { x: Number(h.left ?? 0), y: Number(h.top ?? 0) };
      const canvasCenter = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
      const dx = Math.abs(Number(p.x ?? 0) - canvasCenter.x);
      const dy = Math.abs(Number(p.y ?? 0) - canvasCenter.y);
      const desiredHalfW = Math.max(16, dx);
      const desiredHalfH = Math.max(16, dy);
      const baseW = Math.max(1, Number(s.img.width ?? 0) || 1);
      const baseH = Math.max(1, Number(s.img.height ?? 0) || 1);
      const sx = (2 * desiredHalfW) / baseW;
      const sy = (2 * desiredHalfH) / baseH;
      const nextScale = clamp(Math.max(sx, sy), 0.05, 20);
      runSilently(() => {
        try {
          s.img.set({ scaleX: nextScale, scaleY: nextScale });
          centerImageInCanvas(s.img);
          s.img.setCoords?.();
        } catch {}
      });
      refreshFromImage();
    };

    imgHandles.tl.on?.("moving", () => onImgHandleMoving(imgHandles.tl));
    imgHandles.tr.on?.("moving", () => onImgHandleMoving(imgHandles.tr));
    imgHandles.bl.on?.("moving", () => onImgHandleMoving(imgHandles.bl));
    imgHandles.br.on?.("moving", () => onImgHandleMoving(imgHandles.br));

    const isImageScaleHandleTarget = (opt: any) => {
      const t = (opt as any)?.target;
      return !!t && (t as any).__moldaImageScaleCorner != null;
    };

    session.onMouseDown = (opt: any) => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      if (isImageScaleHandleTarget(opt)) return;
      if (s.closed) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      s.isPointerDown = true;
      s.isDragging = false;
      const p0c = clampPointToRect(getPointer(opt), s.imageRect);
      const p0 = canvasPointToLasso(s, p0c);
      s.downPoint = p0;
      s.lastSample = p0;
      s.dragPoint = p0;
    };

    session.onMouseMove = (opt: any) => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      if (isImageScaleHandleTarget(opt)) return;
      if (!s.isPointerDown) return;
      if (s.closed) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      const pc = clampPointToRect(getPointer(opt), s.imageRect);
      const p = canvasPointToLasso(s, pc);
      const down = s.downPoint;
      if (!down) return;

      s.dragPoint = p;
      const DRAG_START_DIST2 = 4;
      const SAMPLE_DIST2 = 36;
      const dist2Canvas = (a: any, b: any) => {
        const ac = lassoPointToCanvas(s, a);
        const bc = lassoPointToCanvas(s, b);
        const dx = ac.x - bc.x;
        const dy = ac.y - bc.y;
        return dx * dx + dy * dy;
      };

      if (!s.isDragging && dist2Canvas(p, down) > DRAG_START_DIST2) {
        s.isDragging = true;
        const last = s.points[s.points.length - 1];
        if (!last || dist2Canvas(last, down) > 0.25) {
          s.points = [...s.points, { x: down.x, y: down.y, kind: "drag" }];
        }
        s.lastSample = down;
      }

      if (s.isDragging) {
        const first = s.points[0];
        if (first && s.points.length >= 3 && isNear(lassoPointToCanvas(s, p), lassoPointToCanvas(s, first), 12)) {
          s.closed = true;
          s.isPointerDown = false;
          s.isDragging = false;
          s.dragPoint = undefined;
          s.downPoint = undefined;
          s.lastSample = undefined;
          updateEffectLassoGraphics();
          return;
        }

        const last = s.lastSample ?? s.points[s.points.length - 1] ?? down;
        if (dist2Canvas(p, last) >= SAMPLE_DIST2) {
          s.points = [...s.points, { x: p.x, y: p.y, kind: "drag" }];
          s.lastSample = p;
        }
      }
      updateEffectLassoGraphics();
    };

    session.onMouseUp = (opt: any) => {
      const s = effectLassoRef.current;
      if (!s?.active) return;
      if (isImageScaleHandleTarget(opt)) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      const pc = clampPointToRect(getPointer(opt), s.imageRect);
      const p = canvasPointToLasso(s, pc);
      const down = s.downPoint;
      s.isPointerDown = false;

      const ptsNow = s.points;
      const first = ptsNow[0];

      const clickLike = (() => {
        if (!down) return false;
        const a = lassoPointToCanvas(s, p);
        const b = lassoPointToCanvas(s, down);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy <= 36;
      })();

      if (clickLike && first && ptsNow.length >= 3 && isNear(lassoPointToCanvas(s, p), lassoPointToCanvas(s, first), 12)) {
        s.isDragging = false;
        s.dragPoint = undefined;
        s.downPoint = undefined;
        s.lastSample = undefined;

        if (!s.closed) {
          s.closed = true;
          updateEffectLassoGraphics();
          return;
        }
        void confirmEffectLasso();
        return;
      }

      // clique simples adiciona ponto
      if (!s.isDragging) {
        s.points = [...s.points, { x: p.x, y: p.y, kind: "click" }];
        updateEffectLassoGraphics();
      }

      s.isDragging = false;
      s.dragPoint = undefined;
      s.downPoint = undefined;
      s.lastSample = undefined;
    };

    try {
      c.on?.("mouse:down", session.onMouseDown);
      c.on?.("mouse:move", session.onMouseMove);
      c.on?.("mouse:up", session.onMouseUp);
    } catch {}

    try { c.requestRenderAll?.(); } catch {}
  };

  const cancelEffectLasso = () => {
    cleanupEffectLasso({ restoreImage: true });
  };

  const isEffectLassoActive = (): boolean => {
    return !!effectLassoRef.current?.active;
  };

  const updateLassoGraphics = () => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = lassoCropRef.current;
    if (!c || !fabric || !s?.active) return;

    const pts = s.points;

    const basePts = pts.map((p) => lassoPointToCanvas(s, p));
    const strokePts: Array<{ x: number; y: number }> = (() => {
      // Durante arrasto, mostra um preview até o cursor.
      if (s.isPointerDown && s.isDragging && s.dragPoint) {
        const base = basePts.slice();
        if (base.length === 0 && s.downPoint) base.push(lassoPointToCanvas(s, s.downPoint));
        const last = base[base.length - 1];
        const d = lassoPointToCanvas(s, s.dragPoint);
        if (!last || Math.abs(last.x - d.x) > 0.001 || Math.abs(last.y - d.y) > 0.001) base.push({ x: d.x, y: d.y });
        // Fechamento visual do traço
        if (s.closed && base.length >= 3) {
          const f = base[0];
          const l = base[base.length - 1];
          if (Math.abs(f.x - l.x) > 0.001 || Math.abs(f.y - l.y) > 0.001) base.push({ x: f.x, y: f.y });
        }
        return base;
      }

      const base = basePts.slice();
      if (s.closed && base.length >= 3) {
        const f = base[0];
        const l = base[base.length - 1];
        if (Math.abs(f.x - l.x) > 0.001 || Math.abs(f.y - l.y) > 0.001) base.push({ x: f.x, y: f.y });
      }
      return base;
    })();

    const clipPts: Array<{ x: number; y: number }> = (() => {
      // Para clipPath: nunca duplica o primeiro ponto (evita artefatos).
      // Se estiver fechado, usa apenas os pontos "reais".
      if (s.closed) return basePts;
      // Se ainda está desenhando, usa o preview atual (com dragPoint) para mostrar o buraco.
      return strokePts;
    })();

    // Atualiza/recicla marcadores de pontos (viram handles arrastáveis)
    if (!s.isEditingPoint) {
      runSilently(() => {
        try {
          (s.pointMarkers ?? []).forEach((m) => {
            try { c.remove(m); } catch {}
          });
        } catch {}
        s.pointMarkers = [];

        const markerStroke = withAlpha(GIZMO_THEME.stroke, 0.9);
        const markerFill = GIZMO_THEME.primary;

        const DISPLAY_DIST2 = 596; // espaçamento entre marcadores de arrasto
        let lastShown: { x: number; y: number } | null = null;

        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const pc = lassoPointToCanvas(s, p);
          const isFirst = i === 0;
          const isLast = i === pts.length - 1;

          const canEditPoints = !!s.closed;
          const canCloseFromFirst = !s.closed && isFirst && pts.length >= 3;

          let show = false;
          if (isFirst || isLast) show = true;
          else if (p.kind === "click") show = true;
          else if (!lastShown) show = true;
          else {
            const dx = pc.x - lastShown.x;
            const dy = pc.y - lastShown.y;
            if (dx * dx + dy * dy >= DISPLAY_DIST2) show = true;
          }

          if (!show) continue;

          const radius = isFirst ? 9 : 6;
          const m = new fabric.Circle({
            left: pc.x,
            top: pc.y,
            radius,
            originX: "center",
            originY: "center",
            fill: markerFill,
            stroke: markerStroke,
            strokeWidth: 2,
            selectable: canEditPoints || canCloseFromFirst,
            evented: canEditPoints || canCloseFromFirst,
            hasControls: false,
            hasBorders: false,
            lockRotation: true,
            lockScalingX: true,
            lockScalingY: true,
            hoverCursor: canEditPoints ? "move" : canCloseFromFirst ? "pointer" : "default",
            objectCaching: false,
            excludeFromExport: true,
          });
          try { (m as any).__moldaLassoPointIndex = i; } catch {}

          m.on?.("mousedown", (ev: any) => {
            const ss = lassoCropRef.current;
            if (!ss?.active) return;

            // Enquanto o laço está aberto, clique no primeiro ponto deve FECHAR (não editar).
            if (!ss.closed && i === 0 && (ss.points?.length ?? 0) >= 3) {
              // Salva snapshot antes de fechar (via clique no marcador do primeiro ponto)
              pushLassoSnapshot();
              ss.closed = true;
              ss.isPointerDown = false;
              ss.isDragging = false;
              ss.dragPoint = undefined;
              ss.downPoint = undefined;
              ss.lastSample = undefined;
              try { ev?.e?.preventDefault?.(); } catch {}
              try { ev?.e?.stopPropagation?.(); } catch {}
              updateLassoGraphics();
              return;
            }

            // Só permite edição de pontos depois de fechado.
            if (!ss.closed) {
              try { ev?.e?.preventDefault?.(); } catch {}
              try { ev?.e?.stopPropagation?.(); } catch {}
              return;
            }

            // Salva snapshot antes de editar ponto (para poder desfazer edição)
            pushLassoSnapshot();
            ss.isEditingPoint = true;
            ss.editingIndex = i;
            try { ev?.e?.preventDefault?.(); } catch {}
            try { ev?.e?.stopPropagation?.(); } catch {}
          });

          m.on?.("moving", () => {
            const ss = lassoCropRef.current;
            if (!ss?.active) return;
            ss.isEditingPoint = true;
            ss.editingIndex = i;
            const pp = m.getCenterPoint?.() ?? { x: Number(m.left ?? 0), y: Number(m.top ?? 0) };
            const cl = clampPointToRect({ x: Number(pp.x ?? 0), y: Number(pp.y ?? 0) }, ss.imageRect);
            try { m.set({ left: cl.x, top: cl.y }); } catch {}
            try { m.setCoords?.(); } catch {}
            const cur = ss.points[i];
            if (cur) {
              const norm = canvasPointToLasso(ss, cl);
              ss.points[i] = { ...cur, x: norm.x, y: norm.y };
            }
            updateLassoGraphics();
          });

          m.on?.("modified", () => {
            const ss = lassoCropRef.current;
            if (!ss?.active) return;
            ss.isEditingPoint = false;
            ss.editingIndex = undefined;
            updateLassoGraphics();
          });

          s.pointMarkers.push(m);
          try { c.add(m); } catch {}
          lastShown = { x: pc.x, y: pc.y };
        }
      });
    }

    // Overlay sempre escurece o canvas inteiro. Quando houver forma suficiente, cria “buraco”.
    runSilently(() => {
      try {
        (s.overlay as any).clipPath = null;
      } catch {}
    });

    if (strokePts.length >= 2) {
      // Atualiza o stroke (polyline) — sem Math.min(...arr) pra não estourar com muitos pontos
      let minX = Infinity;
      let minY = Infinity;
      for (let i = 0; i < strokePts.length; i++) {
        const p = strokePts[i];
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

      const norm = new Array(strokePts.length);
      for (let i = 0; i < strokePts.length; i++) {
        const p = strokePts[i];
        norm[i] = { x: p.x - minX, y: p.y - minY };
      }
      runSilently(() => {
        try {
          s.stroke.set({ left: minX, top: minY, points: norm });
          s.stroke.setCoords?.();
        } catch {}
      });


      // Se já temos uma área fechável (>=3 pontos), aplica clip invertido no overlay
      if (clipPts.length >= 3) {
        // Normaliza clipPts no mesmo referencial do stroke
        let cMinX = Infinity;
        let cMinY = Infinity;
        for (let i = 0; i < clipPts.length; i++) {
          const p = clipPts[i];
          if (!p) continue;
          if (p.x < cMinX) cMinX = p.x;
          if (p.y < cMinY) cMinY = p.y;
        }
        if (!Number.isFinite(cMinX) || !Number.isFinite(cMinY)) return;

        const cNorm = new Array(clipPts.length);
        for (let i = 0; i < clipPts.length; i++) {
          const p = clipPts[i];
          cNorm[i] = { x: p.x - cMinX, y: p.y - cMinY };
        }

        const poly = new fabric.Polygon(cNorm, {
          left: cMinX,
          top: cMinY,
          originX: "left",
          originY: "top",
          fill: "rgba(0,0,0,1)",
          selectable: false,
          evented: false,
          absolutePositioned: true,
          excludeFromExport: true,
        });
        try { (poly as any).inverted = true; } catch {}
        runSilently(() => {
          try { (s.overlay as any).clipPath = poly; } catch {}
        });
      }
    } else {
      // Sem pontos suficientes, limpa o traço (evita sobrar segmentos após undo)
      runSilently(() => {
        try {
          s.stroke.set({ left: 0, top: 0, points: [] });
          s.stroke.setCoords?.();
        } catch {}
      });
    }

    try {
      s.stroke.bringToFront?.();
    } catch {}
    try {
      (s.pointMarkers ?? []).forEach((m) => m.bringToFront?.());
    } catch {}
    try { c.requestRenderAll?.(); } catch {}
  };

  // Salva o estado atual dos pontos no undoStack antes de modificar
  const pushLassoSnapshot = () => {
    const s = lassoCropRef.current;
    if (!s?.active) return;
    const snapshot: LassoPointsSnapshot = {
      points: s.points.map((p) => ({ ...p })),
      closed: !!s.closed,
    };
    s.undoStack.push(snapshot);
    // Limpa o redoStack quando uma nova ação é feita
    s.redoStack = [];
  };

  // Desfaz o último ponto adicionado (ou a última ação de fechar o laço)
  const undoLassoPoint = (): boolean => {
    const s = lassoCropRef.current;
    if (!s?.active) return false;
    if (s.undoStack.length === 0) return false;

    // Salva estado atual no redoStack antes de restaurar
    const currentSnapshot: LassoPointsSnapshot = {
      points: s.points.map((p) => ({ ...p })),
      closed: !!s.closed,
    };
    s.redoStack.push(currentSnapshot);

    // Restaura estado anterior
    const prev = s.undoStack.pop()!;
    s.points = prev.points.map((p) => ({ ...p }));
    s.closed = prev.closed;

    // Limpa estados de arrasto
    s.isPointerDown = false;
    s.isDragging = false;
    s.dragPoint = undefined;
    s.downPoint = undefined;
    s.lastSample = undefined;
    s.isEditingPoint = false;
    s.editingIndex = undefined;

    updateLassoGraphics();
    return true;
  };

  // Refaz o último ponto desfeito
  const redoLassoPoint = (): boolean => {
    const s = lassoCropRef.current;
    if (!s?.active) return false;
    if (s.redoStack.length === 0) return false;

    // Salva estado atual no undoStack antes de restaurar
    const currentSnapshot: LassoPointsSnapshot = {
      points: s.points.map((p) => ({ ...p })),
      closed: !!s.closed,
    };
    s.undoStack.push(currentSnapshot);

    // Restaura próximo estado
    const next = s.redoStack.pop()!;
    s.points = next.points.map((p) => ({ ...p }));
    s.closed = next.closed;

    // Limpa estados de arrasto
    s.isPointerDown = false;
    s.isDragging = false;
    s.dragPoint = undefined;
    s.downPoint = undefined;
    s.lastSample = undefined;
    s.isEditingPoint = false;
    s.editingIndex = undefined;

    updateLassoGraphics();
    return true;
  };

  // Verifica se pode desfazer ponto do laço
  const canUndoLassoPoint = (): boolean => {
    const s = lassoCropRef.current;
    return !!s?.active && s.undoStack.length > 0;
  };

  // Verifica se pode refazer ponto do laço
  const canRedoLassoPoint = (): boolean => {
    const s = lassoCropRef.current;
    return !!s?.active && s.redoStack.length > 0;
  };

  const startLassoCrop = () => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    if (!c || !fabric) return;

    // limpa qualquer outro modo
    cleanupSquareCropPreview({ restoreImage: true });
    cleanupLassoCropPreview({ restoreImage: true });

    const img = getActiveSingleImageForCrop();
    if (!img) return;

    // Se a imagem já foi cortada via laço e tem metadados, reabre o corte com os pontos salvos.
    try {
      const meta = (img as any).__moldaLassoCropMeta as LassoCropMetadata | undefined;
      if (meta && meta.version === 1 && Array.isArray(meta.points) && meta.points.length >= 3) {
        startLassoCropReEdit();
        return;
      }
    } catch {}

    const originalCenter = (() => {
      try {
        const p = img.getCenterPoint?.();
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: (c.getWidth?.() ?? 0) / 2, y: (c.getHeight?.() ?? 0) / 2 };
    })();
    const originalAngle = Number(img.angle ?? 0);

    // Evita que a imagem seja arrastada durante o modo laço.
    const imgPrev = freezeImageForCrop(img);

    // Evita o retângulo de seleção do Fabric enquanto desenha.
    const canvasPrev = { selection: !!c.selection, defaultCursor: String(c.defaultCursor ?? "") };
    try { c.selection = false; } catch {}
    try { c.defaultCursor = "crosshair"; } catch {}
    try { c.discardActiveObject?.(); } catch {}

    // Centraliza temporariamente a imagem no canvas.
    runSilently(() => {
      try {
        const p = new fabric.Point(c.getWidth() / 2, c.getHeight() / 2);
        img.setPositionByOrigin?.(p, "center", "center");
        img.setCoords?.();
      } catch {}
    });

    const imageRect = (() => {
      try {
        const r = img.getBoundingRect?.(true, true);
        if (r && typeof r.left === "number") return { left: r.left, top: r.top, width: r.width, height: r.height };
      } catch {}
      const left = Number(img.left ?? 0);
      const top = Number(img.top ?? 0);
      const w = Number(img.width ?? 0) * Number(img.scaleX ?? 1);
      const h = Number(img.height ?? 0) * Number(img.scaleY ?? 1);
      return { left, top, width: w, height: h };
    })();

    const imgHandles = makeImageScaleHandles(imageRect);
    if (!imgHandles) return;

    const overlay = new fabric.Rect({
      left: 0,
      top: 0,
      width: Number(c.getWidth?.() ?? 0) || 0,
      height: Number(c.getHeight?.() ?? 0) || 0,
      fill: "rgba(0,0,0,0.55)",
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    const highlight = new fabric.Rect({
      left: imageRect.left,
      top: imageRect.top,
      width: imageRect.width,
      height: imageRect.height,
      fill: "rgba(0,0,0,0)",
      stroke: withAlpha(GIZMO_THEME.primary, 0.8),
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    const stroke = new fabric.Polyline([], {
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      stroke: GIZMO_THEME.primary,
      strokeWidth: 2,
      fill: "rgba(0,0,0,0)",
      objectCaching: false,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    runSilently(() => {
      try { c.add(overlay); } catch {}
      try { c.add(highlight); } catch {}
      try { c.add(imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br); } catch {}
      try { c.add(stroke); } catch {}
      try {
        highlight.bringToFront?.();
        imgHandles.tl.bringToFront?.();
        imgHandles.tr.bringToFront?.();
        imgHandles.bl.bringToFront?.();
        imgHandles.br.bringToFront?.();
        stroke.bringToFront?.();
      } catch {}
    });

    const session: LassoCropSession = {
      active: true,
      img,
      imgPrev,
      canvasPrev,
      imgOriginalCenter: originalCenter,
      imgOriginalAngle: originalAngle,
      imageRect,
      highlight,
      overlay,
      stroke,
      imgHandles,
      points: [],
      isPointerDown: false,
      isFreehand: false,
      closed: false,
      undoStack: [],
      redoStack: [],
    };

    try {
      const exclude = new Set<any>([img, overlay, highlight, stroke, imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br]);
      session.othersPrev = freezeOtherCanvasObjectsForCrop(exclude);
    } catch {}

    lassoCropRef.current = session;
    emitCropMode(true);

    const beginSquareAdjust = () => {
      const s = squareCropRef.current;
      if (!s?.active) return;
      if (s.isAdjusting) return;
      s.isAdjusting = true;

      // Um único registro por gesto: guarda o estado anterior ao arrasto
      try {
        const prev = s.lastRecorded ?? normalizeSquareCropSnapshot(getSquareCropSnapshot(s));
        s.undoStack.push(prev);
        if (s.undoStack.length > MAX_SQUARE_CROP_UNDO) s.undoStack.shift();
        s.redoStack = [];
      } catch {}
    };

    const endSquareAdjust = () => {
      const s = squareCropRef.current;
      if (!s?.active) return;
      s.isAdjusting = false;
      // Atualiza o estado atual (para o próximo gesto/undo)
      try {
        s.lastRecorded = normalizeSquareCropSnapshot(getSquareCropSnapshot(s));
      } catch {}
    };

    const getPointer = (opt: any) => {
      try {
        const p = c.getPointer?.(opt.e);
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: 0, y: 0 };
    };

    const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    };

    const isNear = (a: { x: number; y: number }, b: { x: number; y: number }, radius: number) => dist2(a, b) <= radius * radius;

    const refreshFromImage = () => {
      const s = lassoCropRef.current;
      if (!s?.active) return;
      s.imageRect = getImageRect(s.img);
      (s as any).__syncingImgHandles = true;
      runSilently(() => {
        try {
          s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
          s.highlight.setCoords?.();
        } catch {}
        try {
          const l = s.imageRect.left;
          const t = s.imageRect.top;
          const r = s.imageRect.left + s.imageRect.width;
          const b = s.imageRect.top + s.imageRect.height;
          s.imgHandles.tl.set({ left: l, top: t });
          s.imgHandles.tr.set({ left: r, top: t });
          s.imgHandles.bl.set({ left: l, top: b });
          s.imgHandles.br.set({ left: r, top: b });
          s.imgHandles.tl.setCoords?.();
          s.imgHandles.tr.setCoords?.();
          s.imgHandles.bl.setCoords?.();
          s.imgHandles.br.setCoords?.();
        } catch {}
      });
      (s as any).__syncingImgHandles = false;
      updateLassoGraphics();
      try { c.requestRenderAll?.(); } catch {}
    };

    const onImgHandleMoving = (h: any) => {
      const s = lassoCropRef.current;
      if (!s?.active) return;
      if ((s as any).__syncingImgHandles) return;
      const p = h.getCenterPoint?.() ?? { x: Number(h.left ?? 0), y: Number(h.top ?? 0) };
      const canvasCenter = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
      const dx = Math.abs(Number(p.x ?? 0) - canvasCenter.x);
      const dy = Math.abs(Number(p.y ?? 0) - canvasCenter.y);
      const desiredHalfW = Math.max(16, dx);
      const desiredHalfH = Math.max(16, dy);
      const baseW = Math.max(1, Number(s.img.width ?? 0) || 1);
      const baseH = Math.max(1, Number(s.img.height ?? 0) || 1);
      const sx = (2 * desiredHalfW) / baseW;
      const sy = (2 * desiredHalfH) / baseH;
      const nextScale = clamp(Math.max(sx, sy), 0.05, 20);
      runSilently(() => {
        try {
          s.img.set({ scaleX: nextScale, scaleY: nextScale });
          centerImageInCanvas(s.img);
          s.img.setCoords?.();
        } catch {}
      });
      refreshFromImage();
    };

    const onImgHandleModified = () => {
      refreshFromImage();
    };

    imgHandles.tl.on?.("moving", () => onImgHandleMoving(imgHandles.tl));
    imgHandles.tr.on?.("moving", () => onImgHandleMoving(imgHandles.tr));
    imgHandles.bl.on?.("moving", () => onImgHandleMoving(imgHandles.bl));
    imgHandles.br.on?.("moving", () => onImgHandleMoving(imgHandles.br));
    imgHandles.tl.on?.("modified", onImgHandleModified);
    imgHandles.tr.on?.("modified", onImgHandleModified);
    imgHandles.bl.on?.("modified", onImgHandleModified);
    imgHandles.br.on?.("modified", onImgHandleModified);

    const isImageScaleHandleTarget = (opt: any) => {
      const t = (opt as any)?.target;
      return !!t && (t as any).__moldaImageScaleCorner != null;
    };

    session.onMouseDown = (opt: any) => {
      const s = lassoCropRef.current;
      if (!s?.active) return;
      // Se o usuário clicou/arrastou um handle de escala da imagem, não deve registrar pontos do laço.
      // Importante: não bloquear o evento para permitir o drag do handle.
      if (isImageScaleHandleTarget(opt)) return;
      if ((opt as any)?.target && (opt as any).target.__moldaLassoPointIndex != null) return;
      if (s.closed) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}

      s.isPointerDown = true;
      s.isFreehand = false;
      s.isDragging = false;
      const p0c = clampPointToRect(getPointer(opt), s.imageRect);
      const p0 = canvasPointToLasso(s, p0c);
      s.downPoint = p0;
      s.lastSample = p0;
      s.dragPoint = p0;
    };

    session.onMouseMove = (opt: any) => {
      const s = lassoCropRef.current;
      if (!s?.active) return;
      if (isImageScaleHandleTarget(opt)) return;
      if (s.isEditingPoint) return;
      if (!s.isPointerDown) return;
      if (s.closed) return;
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      const pc = clampPointToRect(getPointer(opt), s.imageRect);
      const p = canvasPointToLasso(s, pc);
      const down = s.downPoint;
      if (!down) return;

      // arrasto: amostra pontos com espaçamento, mantendo fidelidade ao cursor.
      s.dragPoint = p;

      const DRAG_START_DIST2 = 4; // ~2px
      const SAMPLE_DIST2 = 36; // ~6px

      const dist2Canvas = (a: any, b: any) => {
        const ac = lassoPointToCanvas(s, a);
        const bc = lassoPointToCanvas(s, b);
        const dx = ac.x - bc.x;
        const dy = ac.y - bc.y;
        return dx * dx + dy * dy;
      };

      if (!s.isDragging && dist2Canvas(p, down) > DRAG_START_DIST2) {
        s.isDragging = true;
        // garante que o primeiro ponto do segmento seja registrado
        const last = s.points[s.points.length - 1];
        if (!last || dist2Canvas(last, down) > 0.25) {
          // snapshot por ponto (undo granular)
          pushLassoSnapshot();
          s.points = [...s.points, { x: down.x, y: down.y, kind: "drag" }];
        }
        s.lastSample = down;
      }

      if (s.isDragging) {
        // Se aproximar do ponto inicial com o arrasto ativo, fecha automaticamente.
        const first = s.points[0];
        if (first && s.points.length >= 3 && isNear(lassoPointToCanvas(s, p), lassoPointToCanvas(s, first), 12)) {
          // Salva snapshot antes de fechar automaticamente
          pushLassoSnapshot();
          s.closed = true;
          s.isPointerDown = false;
          s.isDragging = false;
          s.dragPoint = undefined;
          s.downPoint = undefined;
          s.lastSample = undefined;
          updateLassoGraphics();
          return;
        }

        const last = s.lastSample ?? s.points[s.points.length - 1] ?? down;
        if (dist2Canvas(p, last) >= SAMPLE_DIST2) {
          // snapshot por ponto (undo granular)
          pushLassoSnapshot();
          s.points = [...s.points, { x: p.x, y: p.y, kind: "drag" }];
          s.lastSample = p;
        }
      }
      updateLassoGraphics();
    };

    session.onMouseUp = (opt: any) => {
      const s = lassoCropRef.current;
      if (!s?.active) return;
      if (isImageScaleHandleTarget(opt)) return;
      if (s.isEditingPoint) {
        s.isEditingPoint = false;
        s.editingIndex = undefined;
        updateLassoGraphics();
        return;
      }
      try { opt?.e?.preventDefault?.(); } catch {}
      try { opt?.e?.stopPropagation?.(); } catch {}
      const pc = clampPointToRect(getPointer(opt), s.imageRect);
      const p = canvasPointToLasso(s, pc);
      const down = s.downPoint;
      s.isPointerDown = false;

      const ptsNow = s.points;
      const first = ptsNow[0];

      const clickLike = (() => {
        if (!down) return false;
        const a = lassoPointToCanvas(s, p);
        const b = lassoPointToCanvas(s, down);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy <= 36;
      })();

      // Clique no primeiro ponto: 1) fecha o laço, 2) se já fechado, confirma.
      if (clickLike && first && ptsNow.length >= 3 && isNear(lassoPointToCanvas(s, p), lassoPointToCanvas(s, first), 12)) {
        s.isDragging = false;
        s.dragPoint = undefined;
        s.downPoint = undefined;
        s.lastSample = undefined;

        if (!s.closed) {
          // Salva snapshot antes de fechar (para poder desfazer o fechamento)
          pushLassoSnapshot();
          s.closed = true;
          updateLassoGraphics();
          return;
        }
        // segundo clique (com laço fechado) confirma
        confirmCrop?.();
        return;
      }

      // Se já estiver fechado, não adiciona mais pontos (use arrastar o contorno para mover).
      if (s.closed) {
        s.downPoint = undefined;
        s.lastSample = undefined;
        s.isDragging = false;
        s.dragPoint = undefined;
        updateLassoGraphics();
        return;
      }

      if (s.isDragging && down) {
        // Arrasto: garante ponto final (e ao menos 2 pontos no segmento).
        // adiciona um por um para permitir desfazer ponto a ponto
        if (s.points.length === 0) {
          pushLassoSnapshot();
          s.points = [...s.points, { x: down.x, y: down.y, kind: "drag" }];
        }
        const last = s.points[s.points.length - 1];
        if (!last || !isNear(lassoPointToCanvas(s, last), lassoPointToCanvas(s, p), 0.5)) {
          pushLassoSnapshot();
          s.points = [...s.points, { x: p.x, y: p.y, kind: "drag" }];
        }
      } else {
        // Clique simples: registra 1 ponto.
        pushLassoSnapshot();
        s.points = [...ptsNow, { x: p.x, y: p.y, kind: "click" }];
      }

      updateLassoGraphics();

      s.downPoint = undefined;
      s.lastSample = undefined;
      s.isDragging = false;
      s.dragPoint = undefined;
    };

    try {
      c.on?.("mouse:down", session.onMouseDown);
      c.on?.("mouse:move", session.onMouseMove);
      c.on?.("mouse:up", session.onMouseUp);
    } catch {}

    updateLassoGraphics();
  };

  // Verifica se a imagem selecionada tem metadados de corte laço e pode ser re-editada
  const canReEditLassoCrop = (): boolean => {
    const img = getActiveSingleImageForCrop();
    if (!img) return false;
    const meta = (img as any).__moldaLassoCropMeta as LassoCropMetadata | undefined;
    return !!meta && meta.version === 1 && Array.isArray(meta.points) && meta.points.length >= 3;
  };

  // Inicia re-edição de um corte laço existente
  const startLassoCropReEdit = () => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    if (!c || !fabric) return;

    const croppedImg = getActiveSingleImageForCrop();
    if (!croppedImg) return;

    const meta = (croppedImg as any).__moldaLassoCropMeta as LassoCropMetadata | undefined;
    if (!meta || meta.version !== 1 || !Array.isArray(meta.points) || meta.points.length < 3) {
      // Sem metadados de corte, inicia novo corte
      startLassoCrop();
      return;
    }

    // Limpa qualquer outro modo
    cleanupSquareCropPreview({ restoreImage: true });
    cleanupLassoCropPreview({ restoreImage: true });

    // Carrega a imagem original para re-edição
    fabric.Image.fromURL(
      meta.originalImageDataUrl,
      (originalImg: any) => {
        if (!originalImg) {
          // Fallback: inicia corte novo na imagem atual
          startLassoCrop();
          return;
        }

        // Salva referência à imagem cortada para removê-la depois
        const croppedImgRef = croppedImg;

        // Insere a imagem original no canvas na mesma posição
        const idx = (() => {
          try {
            const arr = c.getObjects?.();
            if (Array.isArray(arr)) return arr.indexOf(croppedImgRef);
          } catch {}
          return -1;
        })();

        runSilently(() => {
          try {
            // Define propriedades da imagem original. Na re-edição, queremos o mesmo comportamento
            // de quando o laço é acionado pela primeira vez: imagem centralizada para edição.
            // Para manter a mesma "ampliação" percebida, escalamos a imagem original de forma que
            // o bounding box do recorte (calculado pelos pontos salvos) tenha o mesmo tamanho do
            // PNG recortado atualmente.
            const baseW = Number(originalImg.width ?? 0);
            const baseH = Number(originalImg.height ?? 0);
            const savedW = Math.max(1, Number(meta.originalImageRect?.width ?? 1));
            const savedH = Math.max(1, Number(meta.originalImageRect?.height ?? 1));

            let minRelX = Infinity;
            let minRelY = Infinity;
            let maxRelX = -Infinity;
            let maxRelY = -Infinity;
            try {
              for (const pt of meta.points) {
                const x = Number(pt?.x);
                const y = Number(pt?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (x < minRelX) minRelX = x;
                if (y < minRelY) minRelY = y;
                if (x > maxRelX) maxRelX = x;
                if (y > maxRelY) maxRelY = y;
              }
            } catch {}
            const cropBoxW = Math.max(1, Math.ceil((Number.isFinite(maxRelX) ? maxRelX : savedW) - (Number.isFinite(minRelX) ? minRelX : 0)));
            const cropBoxH = Math.max(1, Math.ceil((Number.isFinite(maxRelY) ? maxRelY : savedH) - (Number.isFinite(minRelY) ? minRelY : 0)));

            // Tamanho atual do PNG recortado no canvas (após o usuário redimensionar/mover).
            const croppedRect = getImageRect(croppedImgRef);
            const targetCropW = Math.max(1, Number(croppedRect.width ?? 1));
            const targetCropH = Math.max(1, Number(croppedRect.height ?? 1));

            // Escala dos pontos (e portanto da imagem) para que o recorte fique do mesmo tamanho.
            const sxPts = targetCropW / cropBoxW;
            const syPts = targetCropH / cropBoxH;
            const desiredRectW = savedW * sxPts;
            const desiredRectH = savedH * syPts;

            let desiredScaleX = 1;
            let desiredScaleY = 1;
            if (baseW > 0 && baseH > 0) {
              desiredScaleX = desiredRectW / baseW;
              desiredScaleY = desiredRectH / baseH;
            }

            originalImg.set({
              left: 0,
              top: 0,
              originX: "left",
              originY: "top",
              scaleX: desiredScaleX,
              scaleY: desiredScaleY,
              erasable: true,
              selectable: true,
              evented: true,
            });
            // Centraliza igual ao startLassoCrop
            try {
              const p = new fabric.Point(c.getWidth() / 2, c.getHeight() / 2);
              originalImg.setPositionByOrigin?.(p, "center", "center");
            } catch {}
            originalImg.setCoords?.();

            // Insere no canvas
            if (idx >= 0 && typeof c.insertAt === "function") c.insertAt(originalImg, idx, false);
            else c.add(originalImg);

            // Remove a imagem cortada temporariamente (será restaurada se cancelar)
            c.remove(croppedImgRef);
            originalImg.setCoords?.();
          } catch {}
        });

        // Seleciona a imagem original
        try { c.discardActiveObject?.(); } catch {}
        try { c.setActiveObject?.(originalImg); } catch {}
        try { c.requestRenderAll?.(); } catch {}

        // Agora inicia o lasso crop com essa imagem
        // Precisamos iniciar manualmente pois o startLassoCrop pega a seleção

        const originalCenter = (() => {
          try {
            const p = originalImg.getCenterPoint?.();
            if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
          } catch {}
          return { x: (c.getWidth?.() ?? 0) / 2, y: (c.getHeight?.() ?? 0) / 2 };
        })();
        const originalAngle = Number(originalImg.angle ?? 0);

        const imgPrev = freezeImageForCrop(originalImg);
        const canvasPrev = { selection: !!c.selection, defaultCursor: String(c.defaultCursor ?? "") };
        try { c.selection = false; } catch {}
        try { c.defaultCursor = "crosshair"; } catch {}
        try { c.discardActiveObject?.(); } catch {}

        // Em re-edição, centraliza igual ao startLassoCrop.

        const imageRect = (() => {
          try {
            const r = originalImg.getBoundingRect?.(true, true);
            if (r && typeof r.left === "number") return { left: r.left, top: r.top, width: r.width, height: r.height };
          } catch {}
          const left = Number(originalImg.left ?? 0);
          const top = Number(originalImg.top ?? 0);
          const w = Number(originalImg.width ?? 0) * Number(originalImg.scaleX ?? 1);
          const h = Number(originalImg.height ?? 0) * Number(originalImg.scaleY ?? 1);
          return { left, top, width: w, height: h };
        })();

        const imgHandles = makeImageScaleHandles(imageRect);
        if (!imgHandles) return;

        const overlay = new fabric.Rect({
          left: 0,
          top: 0,
          width: Number(c.getWidth?.() ?? 0) || 0,
          height: Number(c.getHeight?.() ?? 0) || 0,
          fill: "rgba(0,0,0,0.55)",
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });

        const highlight = new fabric.Rect({
          left: imageRect.left,
          top: imageRect.top,
          width: imageRect.width,
          height: imageRect.height,
          fill: "rgba(0,0,0,0)",
          stroke: withAlpha(GIZMO_THEME.primary, 0.8),
          strokeWidth: 2,
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });

        const stroke = new fabric.Polyline([], {
          left: 0,
          top: 0,
          originX: "left",
          originY: "top",
          stroke: GIZMO_THEME.primary,
          strokeWidth: 2,
          fill: "rgba(0,0,0,0)",
          objectCaching: false,
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });

        runSilently(() => {
          try { c.add(overlay); } catch {}
          try { c.add(highlight); } catch {}
          try { c.add(imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br); } catch {}
          try { c.add(stroke); } catch {}
          try {
            highlight.bringToFront?.();
            imgHandles.tl.bringToFront?.();
            imgHandles.tr.bringToFront?.();
            imgHandles.bl.bringToFront?.();
            imgHandles.br.bringToFront?.();
            stroke.bringToFront?.();
          } catch {}
        });

        // Converte pontos relativos para coordenadas absolutas do canvas.
        // Observação: os pontos foram salvos relativos ao imageRect da época; se a imagem reabrir
        // com tamanho diferente, reescala para manter a posição correta.
        const savedW = Math.max(1, Number(meta.originalImageRect?.width ?? imageRect.width ?? 1));
        const savedH = Math.max(1, Number(meta.originalImageRect?.height ?? imageRect.height ?? 1));
        const sxPts = imageRect.width / savedW;
        const syPts = imageRect.height / savedH;
        // Converte pontos salvos (pixels relativos ao imageRect antigo) para NORMALIZADOS no imageRect atual.
        const absolutePoints: LassoPoint[] = meta.points.map((p) => {
          const xPx = Number(p.x ?? 0) * sxPts;
          const yPx = Number(p.y ?? 0) * syPts;
          const u = imageRect.width > 0 ? xPx / imageRect.width : 0;
          const v = imageRect.height > 0 ? yPx / imageRect.height : 0;
          return { x: clamp(u, 0, 1), y: clamp(v, 0, 1), kind: p.kind };
        });

        const session: LassoCropSession = {
          active: true,
          img: originalImg,
          imgPrev,
          canvasPrev,
          imgOriginalCenter: originalCenter,
          imgOriginalAngle: originalAngle,
          imageRect,
          highlight,
          overlay,
          stroke,
          imgHandles,
          points: absolutePoints,
          isPointerDown: false,
          isFreehand: false,
          closed: true, // Já inicia fechado pois estamos re-editando
          undoStack: [],
          redoStack: [],
          isReEdit: true,
          originalImageForReEdit: croppedImgRef,
          originalDataUrlForReEdit: meta.originalImageDataUrl,
        };

        // Salva snapshot inicial (o estado restaurado)
        session.undoStack.push({
          points: absolutePoints.map((p) => ({ ...p })),
          closed: true,
        });

        try {
          const exclude = new Set<any>([originalImg, overlay, highlight, stroke, imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br]);
          session.othersPrev = freezeOtherCanvasObjectsForCrop(exclude);
        } catch {}

        lassoCropRef.current = session;
        emitCropMode(true);

        // Configura handlers (mesmo código de startLassoCrop)
        const getPointer = (opt: any) => {
          try {
            const p = c.getPointer?.(opt.e);
            if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
          } catch {}
          return { x: 0, y: 0 };
        };

        const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          return dx * dx + dy * dy;
        };

        const isNear = (a: { x: number; y: number }, b: { x: number; y: number }, radius: number) => dist2(a, b) <= radius * radius;

        const refreshFromImage = () => {
          const s = lassoCropRef.current;
          if (!s?.active) return;
          s.imageRect = getImageRect(s.img);
          (s as any).__syncingImgHandles = true;
          runSilently(() => {
            try {
              s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
              s.highlight.setCoords?.();
            } catch {}
            try {
              const l = s.imageRect.left;
              const t = s.imageRect.top;
              const r = s.imageRect.left + s.imageRect.width;
              const b = s.imageRect.top + s.imageRect.height;
              s.imgHandles.tl.set({ left: l, top: t });
              s.imgHandles.tr.set({ left: r, top: t });
              s.imgHandles.bl.set({ left: l, top: b });
              s.imgHandles.br.set({ left: r, top: b });
              s.imgHandles.tl.setCoords?.();
              s.imgHandles.tr.setCoords?.();
              s.imgHandles.bl.setCoords?.();
              s.imgHandles.br.setCoords?.();
            } catch {}
          });
          (s as any).__syncingImgHandles = false;
          updateLassoGraphics();
          try { c.requestRenderAll?.(); } catch {}
        };

        const onImgHandleMoving = (h: any) => {
          const s = lassoCropRef.current;
          if (!s?.active) return;
          if ((s as any).__syncingImgHandles) return;
          const p = h.getCenterPoint?.() ?? { x: Number(h.left ?? 0), y: Number(h.top ?? 0) };
          const canvasCenter = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
          const dx = Math.abs(Number(p.x ?? 0) - canvasCenter.x);
          const dy = Math.abs(Number(p.y ?? 0) - canvasCenter.y);
          const desiredHalfW = Math.max(16, dx);
          const desiredHalfH = Math.max(16, dy);
          const baseW = Math.max(1, Number(s.img.width ?? 0) || 1);
          const baseH = Math.max(1, Number(s.img.height ?? 0) || 1);
          const sx = (2 * desiredHalfW) / baseW;
          const sy = (2 * desiredHalfH) / baseH;
          const nextScale = clamp(Math.max(sx, sy), 0.05, 20);
          runSilently(() => {
            try {
              s.img.set({ scaleX: nextScale, scaleY: nextScale });
              centerImageInCanvas(s.img);
              s.img.setCoords?.();
            } catch {}
          });
          refreshFromImage();
        };

        const onImgHandleModified = () => {
          refreshFromImage();
        };

        imgHandles.tl.on?.("moving", () => onImgHandleMoving(imgHandles.tl));
        imgHandles.tr.on?.("moving", () => onImgHandleMoving(imgHandles.tr));
        imgHandles.bl.on?.("moving", () => onImgHandleMoving(imgHandles.bl));
        imgHandles.br.on?.("moving", () => onImgHandleMoving(imgHandles.br));
        imgHandles.tl.on?.("modified", onImgHandleModified);
        imgHandles.tr.on?.("modified", onImgHandleModified);
        imgHandles.bl.on?.("modified", onImgHandleModified);
        imgHandles.br.on?.("modified", onImgHandleModified);

        session.onMouseDown = (opt: any) => {
          const s = lassoCropRef.current;
          if (!s?.active) return;
          // Se o usuário clicou/arrastou um handle de escala da imagem, não deve registrar pontos do laço.
          // Importante: não bloquear o evento para permitir o drag do handle.
          const t = (opt as any)?.target;
          if (t && (t as any).__moldaImageScaleCorner != null) return;
          if ((opt as any)?.target && (opt as any).target.__moldaLassoPointIndex != null) return;
          if (s.closed) return;
          try { opt?.e?.preventDefault?.(); } catch {}
          try { opt?.e?.stopPropagation?.(); } catch {}
          
          pushLassoSnapshot();
          
          s.isPointerDown = true;
          s.isFreehand = false;
          s.isDragging = false;
          const p0 = clampPointToRect(getPointer(opt), s.imageRect);
          s.downPoint = p0;
          s.lastSample = p0;
          s.dragPoint = p0;
        };

        session.onMouseMove = (opt: any) => {
          const s = lassoCropRef.current;
          if (!s?.active) return;
          const t = (opt as any)?.target;
          if (t && (t as any).__moldaImageScaleCorner != null) return;
          if (s.isEditingPoint) return;
          if (!s.isPointerDown) return;
          if (s.closed) return;
          try { opt?.e?.preventDefault?.(); } catch {}
          try { opt?.e?.stopPropagation?.(); } catch {}
          const p = clampPointToRect(getPointer(opt), s.imageRect);
          const down = s.downPoint;
          if (!down) return;

          s.dragPoint = p;

          const DRAG_START_DIST2 = 4;
          const SAMPLE_DIST2 = 36;

          if (!s.isDragging && dist2(p, down) > DRAG_START_DIST2) {
            s.isDragging = true;
            const last = s.points[s.points.length - 1];
            if (!last || dist2(last, down) > 0.25) {
              s.points = [...s.points, { x: down.x, y: down.y, kind: "drag" }];
            }
            s.lastSample = down;
          }

          if (s.isDragging) {
            const first = s.points[0];
            if (first && s.points.length >= 3 && isNear(p, first, 12)) {
              pushLassoSnapshot();
              s.closed = true;
              s.isPointerDown = false;
              s.isDragging = false;
              s.dragPoint = undefined;
              s.downPoint = undefined;
              s.lastSample = undefined;
              updateLassoGraphics();
              return;
            }

            const last = s.lastSample ?? s.points[s.points.length - 1] ?? down;
            if (dist2(p, last) >= SAMPLE_DIST2) {
              s.points = [...s.points, { x: p.x, y: p.y, kind: "drag" }];
              s.lastSample = p;
            }
          }
          updateLassoGraphics();
        };

        session.onMouseUp = (opt: any) => {
          const s = lassoCropRef.current;
          if (!s?.active) return;
          const t = (opt as any)?.target;
          if (t && (t as any).__moldaImageScaleCorner != null) return;
          if (s.isEditingPoint) {
            s.isEditingPoint = false;
            s.editingIndex = undefined;
            updateLassoGraphics();
            return;
          }
          try { opt?.e?.preventDefault?.(); } catch {}
          try { opt?.e?.stopPropagation?.(); } catch {}
          const p = clampPointToRect(getPointer(opt), s.imageRect);
          const down = s.downPoint;
          s.isPointerDown = false;

          const ptsNow = s.points;
          const first = ptsNow[0];

          const clickLike = !!down && dist2(p, down) <= 36;

          if (clickLike && first && ptsNow.length >= 3 && isNear(p, first, 12)) {
            s.isDragging = false;
            s.dragPoint = undefined;
            s.downPoint = undefined;
            s.lastSample = undefined;

            if (!s.closed) {
              pushLassoSnapshot();
              s.closed = true;
              updateLassoGraphics();
              return;
            }
            confirmCrop?.();
            return;
          }

          if (s.closed) {
            s.downPoint = undefined;
            s.lastSample = undefined;
            s.isDragging = false;
            s.dragPoint = undefined;
            updateLassoGraphics();
            return;
          }

          if (s.isDragging && down) {
            const nextPoints = ptsNow.slice();
            if (nextPoints.length === 0) nextPoints.push({ x: down.x, y: down.y, kind: "drag" });
            const last = nextPoints[nextPoints.length - 1];
            if (!last || !isNear(last, p, 0.5)) nextPoints.push({ x: p.x, y: p.y, kind: "drag" });
            s.points = nextPoints;
          } else {
            s.points = [...ptsNow, { x: p.x, y: p.y, kind: "click" }];
          }

          updateLassoGraphics();

          s.downPoint = undefined;
          s.lastSample = undefined;
          s.isDragging = false;
          s.dragPoint = undefined;
        };

        try {
          c.on?.("mouse:down", session.onMouseDown);
          c.on?.("mouse:move", session.onMouseMove);
          c.on?.("mouse:up", session.onMouseUp);
        } catch {}

        updateLassoGraphics();
      },
      { crossOrigin: "anonymous" }
    );
  };

  const cleanupSquareCropPreview = (opts?: { restoreImage?: boolean }) => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = squareCropRef.current;
    if (!c || !fabric || !s) return;

    runSilently(() => {
      try {
        const prev = (s as any).canvasPrev;
        if (prev && typeof prev.selection === "boolean") c.selection = prev.selection;
        if (prev && typeof prev.defaultCursor === "string") c.defaultCursor = prev.defaultCursor;
      } catch {}

      try {
        restoreOtherCanvasObjectsAfterCrop(s.othersPrev);
      } catch {}
      try { c.remove(s.imgHandles?.tl); } catch {}
      try { c.remove(s.imgHandles?.tr); } catch {}
      try { c.remove(s.imgHandles?.bl); } catch {}
      try { c.remove(s.imgHandles?.br); } catch {}
      try { c.remove(s.cropBox); } catch {}
      try { c.remove(s.handles.tl); } catch {}
      try { c.remove(s.handles.tr); } catch {}
      try { c.remove(s.handles.bl); } catch {}
      try { c.remove(s.handles.br); } catch {}
      try { c.remove(s.overlays.top); } catch {}
      try { c.remove(s.overlays.bottom); } catch {}
      try { c.remove(s.overlays.left); } catch {}
      try { c.remove(s.overlays.right); } catch {}
      try { c.remove(s.highlight); } catch {}

      try {
        restoreImageAfterCrop(s.img, (s as any).imgPrev);
      } catch {}

      if (opts?.restoreImage !== false) {
        try {
          const p = new fabric.Point(s.imgOriginalCenter.x, s.imgOriginalCenter.y);
          s.img.setPositionByOrigin?.(p, "center", "center");
          s.img.set({ angle: s.imgOriginalAngle });
          s.img.setCoords?.();
        } catch {}
      }
    });

    squareCropRef.current = null;
    emitCropMode(false);
    try { c.requestRenderAll?.(); } catch {}
  };

  const updateSquareCropPreview = () => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = squareCropRef.current;
    if (!c || !fabric || !s?.active) return;

    const imgR = s.imageRect;
    const boxLeft = Number(s.cropBox.left ?? 0);
    const boxTop = Number(s.cropBox.top ?? 0);
    const nextW = Number(s.cropBox.width ?? s.size) || s.size;
    const nextH = Number(s.cropBox.height ?? s.size) || s.size;

    const w = Math.max(10, nextW);
    const h = Math.max(10, nextH);
    const minLeft = imgR.left;
    const maxLeft = imgR.left + imgR.width - w;
    const minTop = imgR.top;
    const maxTop = imgR.top + imgR.height - h;

    const cl = clamp(boxLeft, minLeft, maxLeft);
    const ct = clamp(boxTop, minTop, maxTop);

    const setHandlePos = (h: any, x: number, y: number) => {
      try {
        h.set({ left: x, top: y });
        h.setCoords?.();
      } catch {}
    };

    runSilently(() => {
      // cropBox retangular (handles independentes)
      try { s.cropBox.set({ left: cl, top: ct, width: w, height: h }); } catch {}
      try { s.cropBox.setCoords?.(); } catch {}
      s.size = Math.max(w, h);

      // handles nos vértices
      setHandlePos(s.handles.tl, cl, ct);
      setHandlePos(s.handles.tr, cl + w, ct);
      setHandlePos(s.handles.bl, cl, ct + h);
      setHandlePos(s.handles.br, cl + w, ct + h);

      const canvasW = Number(c.getWidth?.() ?? 0) || 0;
      const canvasH = Number(c.getHeight?.() ?? 0) || 0;

      const topH = Math.max(0, ct);
      const bottomH = Math.max(0, canvasH - (ct + h));
      const leftW = Math.max(0, cl);
      const rightW = Math.max(0, canvasW - (cl + w));

      // overlay global: escurece todo o canvas fora do recorte
      try { s.overlays.top.set({ left: 0, top: 0, width: canvasW, height: topH }); } catch {}
      try { s.overlays.bottom.set({ left: 0, top: ct + h, width: canvasW, height: bottomH }); } catch {}
      try { s.overlays.left.set({ left: 0, top: ct, width: leftW, height: h }); } catch {}
      try { s.overlays.right.set({ left: cl + w, top: ct, width: rightW, height: h }); } catch {}
      try { s.overlays.top.setCoords?.(); } catch {}
      try { s.overlays.bottom.setCoords?.(); } catch {}
      try { s.overlays.left.setCoords?.(); } catch {}
      try { s.overlays.right.setCoords?.(); } catch {}
    });

    try {
      // garante z-order
      s.cropBox.bringToFront?.();
      s.handles.tl.bringToFront?.();
      s.handles.tr.bringToFront?.();
      s.handles.bl.bringToFront?.();
      s.handles.br.bringToFront?.();
    } catch {}

    try { c.requestRenderAll?.(); } catch {}
  };

  const startSquareCrop = () => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    if (!c || !fabric) return;

    // Se já houver um preview ativo, limpa antes.
    cleanupSquareCropPreview({ restoreImage: true });

    const img = getActiveSingleImageForCrop();
    if (!img) return;

    const originalCenter = (() => {
      try {
        const p = img.getCenterPoint?.();
        if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
      } catch {}
      return { x: (c.getWidth?.() ?? 0) / 2, y: (c.getHeight?.() ?? 0) / 2 };
    })();
    const originalAngle = Number(img.angle ?? 0);

    // Evita que o usuário arraste a imagem durante o recorte.
    const imgPrev = freezeImageForCrop(img);

    // Evita o retângulo de seleção do Fabric durante o crop.
    const canvasPrev = { selection: !!c.selection, defaultCursor: String(c.defaultCursor ?? "") };
    try { c.selection = false; } catch {}
    try { c.defaultCursor = "default"; } catch {}
    try { c.discardActiveObject?.(); } catch {}

    // Centraliza temporariamente a imagem no canvas.
    runSilently(() => {
      try {
        const p = new fabric.Point(c.getWidth() / 2, c.getHeight() / 2);
        img.setPositionByOrigin?.(p, "center", "center");
        img.setCoords?.();
      } catch {}
    });

    const imageRect = (() => {
      try {
        const r = img.getBoundingRect?.(true, true);
        if (r && typeof r.left === "number") return { left: r.left, top: r.top, width: r.width, height: r.height };
      } catch {}
      // fallback simples
      const left = Number(img.left ?? 0);
      const top = Number(img.top ?? 0);
      const w = Number(img.width ?? 0) * Number(img.scaleX ?? 1);
      const h = Number(img.height ?? 0) * Number(img.scaleY ?? 1);
      return { left, top, width: w, height: h };
    })();

    const imgHandles = makeImageScaleHandles(imageRect);
    if (!imgHandles) return;

    const size = Math.max(10, Math.min(imageRect.width, imageRect.height));
    const startW = size;
    const startH = size;
    const startLeft = imageRect.left + (imageRect.width - startW) / 2;
    const startTop = imageRect.top + (imageRect.height - startH) / 2;
    const overhang = 14;

    const overlayFill = "rgba(0,0,0,0.55)";

    const canvasW = Number(c.getWidth?.() ?? 0) || 0;
    const canvasH = Number(c.getHeight?.() ?? 0) || 0;

    const overlays = {
      top: new fabric.Rect({ left: 0, top: 0, width: canvasW, height: Math.max(0, startTop), fill: overlayFill, selectable: false, evented: false, excludeFromExport: true }),
      bottom: new fabric.Rect({ left: 0, top: startTop + startH, width: canvasW, height: Math.max(0, canvasH - (startTop + startH)), fill: overlayFill, selectable: false, evented: false, excludeFromExport: true }),
      left: new fabric.Rect({ left: 0, top: startTop, width: Math.max(0, startLeft), height: startH, fill: overlayFill, selectable: false, evented: false, excludeFromExport: true }),
      right: new fabric.Rect({ left: startLeft + startW, top: startTop, width: Math.max(0, canvasW - (startLeft + startW)), height: startH, fill: overlayFill, selectable: false, evented: false, excludeFromExport: true }),
    };

    const highlight = new fabric.Rect({
      left: imageRect.left,
      top: imageRect.top,
      width: imageRect.width,
      height: imageRect.height,
      fill: "rgba(0,0,0,0)",
      stroke: withAlpha(GIZMO_THEME.primary, 0.8),
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    // Caixa arrastável (invisível) que controla o quadrado
    const cropBox = new fabric.Rect({
      left: startLeft,
      top: startTop,
      width: startW,
      height: startH,
      fill: "rgba(0,0,0,0)",
      stroke: withAlpha(GIZMO_THEME.primary, 0.55),
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: false,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      hoverCursor: "move",
      excludeFromExport: true,
    });

    const handleRadius = 7;
    const handleStroke = withAlpha(GIZMO_THEME.stroke, 0.9);
    const handleFill = GIZMO_THEME.primary;
    const makeHandle = (corner: "tl" | "tr" | "bl" | "br", x: number, y: number) => {
      const h = new fabric.Circle({
        left: x,
        top: y,
        radius: handleRadius,
        originX: "center",
        originY: "center",
        fill: handleFill,
        stroke: handleStroke,
        strokeWidth: 2,
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: false,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        hoverCursor: "nwse-resize",
        excludeFromExport: true,
      });
      try { (h as any).__moldaSquareCropCorner = corner; } catch {}
      return h;
    };

    const handles = {
      tl: makeHandle("tl", startLeft, startTop),
      tr: makeHandle("tr", startLeft + startW, startTop),
      bl: makeHandle("bl", startLeft, startTop + startH),
      br: makeHandle("br", startLeft + startW, startTop + startH),
    };

    // Adiciona ao canvas sem capturar histórico.
    runSilently(() => {
      try { c.add(overlays.top, overlays.bottom, overlays.left, overlays.right); } catch {}
      try { c.add(highlight); } catch {}
      try { c.add(imgHandles.tl, imgHandles.tr, imgHandles.bl, imgHandles.br); } catch {}
      try { c.add(cropBox); } catch {}
      try { c.add(handles.tl, handles.tr, handles.bl, handles.br); } catch {}
      try {
        // garante que o crop UI fique acima
        cropBox.bringToFront?.();
        handles.tl.bringToFront?.();
        handles.tr.bringToFront?.();
        handles.bl.bringToFront?.();
        handles.br.bringToFront?.();
      } catch {}
      try { c.setActiveObject?.(cropBox); } catch {}
    });

    squareCropRef.current = {
      active: true,
      img,
      imgPrev,
      canvasPrev,
      imgOriginalCenter: originalCenter,
      imgOriginalAngle: originalAngle,
      cropBox,
      handles,
      imgHandles,
      overlays,
      highlight,
      size,
      overhang,
      imageRect,

      undoStack: [],
      redoStack: [],
      isAdjusting: false,
      lastRecorded: undefined,
    };

    // Estado inicial para gravação incremental
    try {
      squareCropRef.current.lastRecorded = normalizeSquareCropSnapshot(getSquareCropSnapshot(squareCropRef.current));
    } catch {}

    try {
      const exclude = new Set<any>([
        img,
        overlays.top,
        overlays.bottom,
        overlays.left,
        overlays.right,
        highlight,
        cropBox,
        handles.tl,
        handles.tr,
        handles.bl,
        handles.br,
        imgHandles.tl,
        imgHandles.tr,
        imgHandles.bl,
        imgHandles.br,
      ]);
      squareCropRef.current.othersPrev = freezeOtherCanvasObjectsForCrop(exclude);
    } catch {}

    emitCropMode(true);

    const beginSquareAdjust = () => {
      const s = squareCropRef.current;
      if (!s?.active) return;
      if (s.isAdjusting) return;
      s.isAdjusting = true;

      // Um único registro por gesto: guarda o estado anterior ao arrasto
      try {
        const prev = s.lastRecorded ?? normalizeSquareCropSnapshot(getSquareCropSnapshot(s));
        s.undoStack.push(prev);
        if (s.undoStack.length > MAX_SQUARE_CROP_UNDO) s.undoStack.shift();
        s.redoStack = [];
      } catch {}
    };

    const endSquareAdjust = () => {
      const s = squareCropRef.current;
      if (!s?.active) return;
      s.isAdjusting = false;
      // Atualiza o estado atual (para o próximo gesto/undo)
      try {
        s.lastRecorded = normalizeSquareCropSnapshot(getSquareCropSnapshot(s));
      } catch {}
    };

    const refreshFromImage = () => {
      const s = squareCropRef.current;
      if (!s?.active) return;
      s.imageRect = getImageRect(s.img);
      (s as any).__syncingImgHandles = true;
      runSilently(() => {
        try {
          s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
          s.highlight.setCoords?.();
        } catch {}
        try {
          const l = s.imageRect.left;
          const t = s.imageRect.top;
          const r = s.imageRect.left + s.imageRect.width;
          const b = s.imageRect.top + s.imageRect.height;
          s.imgHandles.tl.set({ left: l, top: t });
          s.imgHandles.tr.set({ left: r, top: t });
          s.imgHandles.bl.set({ left: l, top: b });
          s.imgHandles.br.set({ left: r, top: b });
          s.imgHandles.tl.setCoords?.();
          s.imgHandles.tr.setCoords?.();
          s.imgHandles.bl.setCoords?.();
          s.imgHandles.br.setCoords?.();
        } catch {}
      });
      (s as any).__syncingImgHandles = false;
      updateSquareCropPreview();
      try { c.requestRenderAll?.(); } catch {}
    };

    const onAnyDrag = () => updateSquareCropPreview();

    // Move o recorte inteiro
    cropBox.on?.("moving", () => {
      beginSquareAdjust();
      onAnyDrag();
    });
    cropBox.on?.("modified", () => {
      onAnyDrag();
      endSquareAdjust();
    });

    const onImgHandleMoving = (h: any) => {
      const s = squareCropRef.current;
      if (!s?.active) return;
      if ((s as any).__syncingImgHandles) return;
      beginSquareAdjust();
      const p = h.getCenterPoint?.() ?? { x: Number(h.left ?? 0), y: Number(h.top ?? 0) };
      const canvasCenter = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
      const dx = Math.abs(Number(p.x ?? 0) - canvasCenter.x);
      const dy = Math.abs(Number(p.y ?? 0) - canvasCenter.y);
      const desiredHalfW = Math.max(16, dx);
      const desiredHalfH = Math.max(16, dy);
      const baseW = Math.max(1, Number(s.img.width ?? 0) || 1);
      const baseH = Math.max(1, Number(s.img.height ?? 0) || 1);
      const sx = (2 * desiredHalfW) / baseW;
      const sy = (2 * desiredHalfH) / baseH;
      const nextScale = clamp(Math.max(sx, sy), 0.05, 20);

      runSilently(() => {
        try {
          s.img.set({ scaleX: nextScale, scaleY: nextScale });
          centerImageInCanvas(s.img);
          s.img.setCoords?.();
        } catch {}
      });
      refreshFromImage();
    };

    const onImgHandleModified = () => {
      refreshFromImage();
      endSquareAdjust();
    };

    imgHandles.tl.on?.("moving", () => onImgHandleMoving(imgHandles.tl));
    imgHandles.tr.on?.("moving", () => onImgHandleMoving(imgHandles.tr));
    imgHandles.bl.on?.("moving", () => onImgHandleMoving(imgHandles.bl));
    imgHandles.br.on?.("moving", () => onImgHandleMoving(imgHandles.br));
    imgHandles.tl.on?.("modified", onImgHandleModified);
    imgHandles.tr.on?.("modified", onImgHandleModified);
    imgHandles.bl.on?.("modified", onImgHandleModified);
    imgHandles.br.on?.("modified", onImgHandleModified);

    const onHandleMoving = (h: any) => {
      const session = squareCropRef.current;
      if (!session?.active) return;
      beginSquareAdjust();
      const imgR = session.imageRect;
      const corner = String((h as any).__moldaSquareCropCorner || "");

      // Centro do handle
      const p = h.getCenterPoint?.() ?? { x: Number(h.left ?? 0), y: Number(h.top ?? 0) };
      const x = Number(p.x ?? 0);
      const y = Number(p.y ?? 0);

      const left = Number(session.cropBox.left ?? 0);
      const top = Number(session.cropBox.top ?? 0);
      const w0 = Number(session.cropBox.width ?? session.size) || session.size;
      const h0 = Number(session.cropBox.height ?? session.size) || session.size;
      const w = Math.max(10, w0);
      const hgt = Math.max(10, h0);

      const tl = { x: left, y: top };
      const tr = { x: left + w, y: top };
      const bl = { x: left, y: top + hgt };
      const br = { x: left + w, y: top + hgt };

      const minSize = 20;

      const clampX = (vx: number) => clamp(vx, imgR.left, imgR.left + imgR.width);
      const clampY = (vy: number) => clamp(vy, imgR.top, imgR.top + imgR.height);

      let nextLeft = left;
      let nextTop = top;
      let nextW = w;
      let nextH = hgt;

      if (corner === "tl") {
        const ax = br.x;
        const ay = br.y;
        const cx = clampX(x);
        const cy = clampY(y);
        nextLeft = cx;
        nextTop = cy;
        nextW = Math.max(minSize, ax - cx);
        nextH = Math.max(minSize, ay - cy);
      } else if (corner === "tr") {
        const ax = bl.x;
        const ay = bl.y;
        const cx = clampX(x);
        const cy = clampY(y);
        nextLeft = ax;
        nextTop = cy;
        nextW = Math.max(minSize, cx - ax);
        nextH = Math.max(minSize, ay - cy);
      } else if (corner === "bl") {
        const ax = tr.x;
        const ay = tr.y;
        const cx = clampX(x);
        const cy = clampY(y);
        nextLeft = cx;
        nextTop = ay;
        nextW = Math.max(minSize, ax - cx);
        nextH = Math.max(minSize, cy - ay);
      } else if (corner === "br") {
        const ax = tl.x;
        const ay = tl.y;
        const cx = clampX(x);
        const cy = clampY(y);
        nextLeft = ax;
        nextTop = ay;
        nextW = Math.max(minSize, cx - ax);
        nextH = Math.max(minSize, cy - ay);
      }

      // Aplica e clampa no retângulo da imagem
      runSilently(() => {
        try { session.cropBox.set({ left: nextLeft, top: nextTop, width: nextW, height: nextH }); } catch {}
        try { session.cropBox.setCoords?.(); } catch {}
      });
      updateSquareCropPreview();
    };

    handles.tl.on?.("moving", () => onHandleMoving(handles.tl));
    handles.tr.on?.("moving", () => onHandleMoving(handles.tr));
    handles.bl.on?.("moving", () => onHandleMoving(handles.bl));
    handles.br.on?.("moving", () => onHandleMoving(handles.br));

    handles.tl.on?.("modified", () => { onAnyDrag(); endSquareAdjust(); });
    handles.tr.on?.("modified", () => { onAnyDrag(); endSquareAdjust(); });
    handles.bl.on?.("modified", () => { onAnyDrag(); endSquareAdjust(); });
    handles.br.on?.("modified", () => { onAnyDrag(); endSquareAdjust(); });

    updateSquareCropPreview();
  };

  const cancelSquareCrop = () => {
    cleanupSquareCropPreview({ restoreImage: true });
  };

  const confirmCrop = () => {
    // Prioriza o modo ativo
    if (squareCropRef.current?.active) {
      commitSquareCrop();
      return;
    }
    if (lassoCropRef.current?.active) {
      commitLassoCrop();
      return;
    }
  };

  const isCropActive = () => {
    return !!squareCropRef.current?.active || !!lassoCropRef.current?.active;
  };

  const cancelCrop = () => {
    if (squareCropRef.current?.active) {
      cancelSquareCrop();
      return;
    }
    if (lassoCropRef.current?.active) {
      cancelLassoCrop();
      return;
    }
  };

  const cancelLassoCrop = () => {
    const c: any = canvasRef.current;
    const s = lassoCropRef.current;
    
    // Se estávamos re-editando, restaura a imagem cortada original
    if (s?.isReEdit && s.originalImageForReEdit && c) {
      const croppedImg = s.originalImageForReEdit;
      const tempOriginalImg = s.img;
      
      runSilently(() => {
        try {
          // Restaura a imagem cortada original
          const idx = (() => {
            try {
              const arr = c.getObjects?.();
              if (Array.isArray(arr)) return arr.indexOf(tempOriginalImg);
            } catch {}
            return -1;
          })();
          
          if (idx >= 0 && typeof c.insertAt === "function") {
            c.insertAt(croppedImg, idx, false);
          } else {
            c.add(croppedImg);
          }
          
          // Remove a imagem original temporária
          c.remove(tempOriginalImg);
          croppedImg.setCoords?.();
        } catch {}
      });
      
      // Seleciona a imagem restaurada
      try { c.discardActiveObject?.(); } catch {}
      try { c.setActiveObject?.(croppedImg); } catch {}
    }
    
    cleanupLassoCropPreview({ restoreImage: true });
  };

  const commitLassoCrop = () => {
    const c: any = canvasRef.current;
    const fabric: any = fabricRef.current;
    const s = lassoCropRef.current;
    if (!c || !fabric || !s?.active) return;
    const img = s.img;

    const ptsCanvas = (s.points ?? []).map((p: any) => {
      const pc = lassoPointToCanvas(s, p);
      return { x: pc.x, y: pc.y, kind: p.kind };
    });
    if (ptsCanvas.length < 3) return;

    // Captura o dataUrl da imagem original para re-edição
    const originalImageDataUrl: string | null = (() => {
      // Se é re-edição, usa o original guardado
      if (s.isReEdit && s.originalDataUrlForReEdit) {
        return s.originalDataUrlForReEdit;
      }

      // Preferir uma fonte já guardada (mais confiável e não depende de canvas não-tainted)
      try {
        const src = (img as any).__moldaOriginalSrc;
        if (typeof src === "string" && src.length > 0) return src;
      } catch {}

      // Senão, gera do elemento atual
      try {
        const el: any = img.getElement?.() ?? img._element ?? img._originalElement;
        if (!el) return null;
        const tmp = document.createElement("canvas");
        const cropX = Number(img.cropX ?? 0) || 0;
        const cropY = Number(img.cropY ?? 0) || 0;
        const srcW = Number(img.width ?? 0) || (el.naturalWidth ?? el.width ?? 0);
        const srcH = Number(img.height ?? 0) || (el.naturalHeight ?? el.height ?? 0);
        tmp.width = srcW;
        tmp.height = srcH;
        const ctx = tmp.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(el, cropX, cropY, srcW, srcH, 0, 0, srcW, srcH);
        return tmp.toDataURL("image/png");
      } catch {
        return null;
      }
    })();

    // Rasteriza o recorte em uma nova imagem (PNG) para que o gizmo seja do recorte.
    let minCX = Infinity;
    let minCY = Infinity;
    let maxCX = -Infinity;
    let maxCY = -Infinity;
    for (let i = 0; i < ptsCanvas.length; i++) {
      const p = ptsCanvas[i];
      if (!p) continue;
      if (p.x < minCX) minCX = p.x;
      if (p.y < minCY) minCY = p.y;
      if (p.x > maxCX) maxCX = p.x;
      if (p.y > maxCY) maxCY = p.y;
    }
    if (!Number.isFinite(minCX) || !Number.isFinite(minCY) || !Number.isFinite(maxCX) || !Number.isFinite(maxCY)) return;

    const outW = Math.max(1, Math.ceil(maxCX - minCX));
    const outH = Math.max(1, Math.ceil(maxCY - minCY));
    if (outW < 2 || outH < 2) return;

    // Converte pontos para coordenadas relativas ao imageRect (para re-edição)
    const relativePoints: LassoPoint[] = (s.points ?? []).map((p: any) => ({
      x: clamp(Number(p.x ?? 0), 0, 1) * s.imageRect.width,
      y: clamp(Number(p.y ?? 0), 0, 1) * s.imageRect.height,
      kind: p.kind,
    }));

    const dataUrl: string | null = (() => {
      try {
        const el: any = img.getElement?.() ?? img._element ?? img._originalElement;
        if (!el) return null;

        const tmp = document.createElement("canvas");
        tmp.width = outW;
        tmp.height = outH;
        const ctx = tmp.getContext("2d");
        if (!ctx) return null;

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < ptsCanvas.length; i++) {
          const p = ptsCanvas[i];
          const x = p.x - minCX;
          const y = p.y - minCY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.clip();

        const cropX = Number(img.cropX ?? 0) || 0;
        const cropY = Number(img.cropY ?? 0) || 0;
        const srcW = Number(img.width ?? 0) || (el.naturalWidth ?? el.width ?? 0);
        const srcH = Number(img.height ?? 0) || (el.naturalHeight ?? el.height ?? 0);
        const sx = Number(img.scaleX ?? 1) || 1;
        const sy = Number(img.scaleY ?? 1) || 1;

        const dx = Number(img.left ?? 0) - minCX;
        const dy = Number(img.top ?? 0) - minCY;
        const dw = srcW * sx;
        const dh = srcH * sy;

        ctx.drawImage(el, cropX, cropY, srcW, srcH, dx, dy, dw, dh);
        ctx.restore();

        return tmp.toDataURL("image/png");
      } catch {
        return null;
      }
    })();

    // Encerra o modo de corte (UI) imediatamente (sem "voltar" a imagem para o centro original).
    cleanupLassoCropPreview({ restoreImage: false });

    if (!dataUrl) return;

    // Evita que o usuário clique/seleciona a imagem antiga enquanto a nova carrega.
    try {
      runSilently(() => {
        try { img.set?.({ selectable: false, evented: false }); } catch {}
        try { img.setCoords?.(); } catch {}
      });
    } catch {}

    const idx = (() => {
      try {
        const arr = c.getObjects?.();
        if (Array.isArray(arr)) return arr.indexOf(img);
      } catch {}
      return -1;
    })();

    // Metadados para permitir re-edição do corte
    const lassoCropMeta: LassoCropMetadata | null = originalImageDataUrl ? {
      version: 1,
      points: relativePoints,
      originalImageDataUrl,
      originalImageRect: { ...s.imageRect },
    } : null;

    fabric.Image.fromURL(
      dataUrl,
      (newImg: any) => {
        if (!newImg) return;
        runSilently(() => {
          try {
            newImg.set({
              left: minCX,
              top: minCY,
              originX: "left",
              originY: "top",
              scaleX: 1,
              scaleY: 1,
              erasable: true,
              selectable: true,
              evented: true,
            });
          } catch {}

          // Para ajustes futuros, a base agora é o PNG recortado.
          try { (newImg as any).__moldaOriginalSrc = dataUrl; } catch {}
          try {
            const adj = (img as any).__moldaImageAdjustments;
            if (adj) (newImg as any).__moldaImageAdjustments = adj;
          } catch {}
          
          // Armazena metadados do corte laço para re-edição
          if (lassoCropMeta) {
            try { (newImg as any).__moldaLassoCropMeta = lassoCropMeta; } catch {}
          }

          try {
            if (idx >= 0 && typeof c.insertAt === "function") c.insertAt(newImg, idx, false);
            else c.add(newImg);
          } catch {
            try { c.add(newImg); } catch {}
          }
          try { c.remove(img); } catch {}
          try { newImg.setCoords?.(); } catch {}
        });

        // gizmo novo
        try { c.discardActiveObject?.(); } catch {}
        try { c.setActiveObject?.(newImg); } catch {}
        try { c.requestRenderAll?.(); } catch {}

        try {
          if (!isRestoringRef.current && !isLoadingRef.current) {
            historyRef.current?.push("crop-lasso");
            emitHistory();
          }
        } catch {}
      },
      { crossOrigin: "anonymous" }
    );
  };

  const commitSquareCrop = () => {
    const c: any = canvasRef.current;
    const s = squareCropRef.current;
    if (!c || !s?.active) return;

    const img = s.img;
    const cropBox = s.cropBox;

    // Recalcula retângulo da imagem (após centralização), para mapear coordenadas.
    const imgRect = (() => {
      try {
        const r = img.getBoundingRect?.(true, true);
        if (r && typeof r.left === "number") return { left: r.left, top: r.top, width: r.width, height: r.height };
      } catch {}
      return s.imageRect;
    })();

    const scaleX = Number(img.scaleX ?? 1) || 1;
    const scaleY = Number(img.scaleY ?? 1) || 1;
    const existingCropX = Number(img.cropX ?? 0) || 0;
    const existingCropY = Number(img.cropY ?? 0) || 0;

    const relX = Number(cropBox.left ?? 0) - imgRect.left;
    const relY = Number(cropBox.top ?? 0) - imgRect.top;

    const wNow = Number(s.cropBox.width ?? s.size) || s.size;
    const hNow = Number(s.cropBox.height ?? s.size) || s.size;
    // Converte o tamanho do box (canvas units) para pixels da fonte.
    const wPxRaw = Math.max(1, Math.round(wNow / scaleX));
    const hPxRaw = Math.max(1, Math.round(hNow / scaleY));

    // Em Fabric, img.width/img.height representam o "window" atual em pixels da fonte (especialmente se já havia crop).
    // Precisamos clamping para não gerar crop fora do range (o que pode renderizar em branco).
    const windowW = Math.max(1, Math.round(Number(img.width ?? 0) || wPxRaw));
    const windowH = Math.max(1, Math.round(Number(img.height ?? 0) || hPxRaw));

    const wPx = clamp(wPxRaw, 1, windowW);
    const hPx = clamp(hPxRaw, 1, windowH);

    const newCropXRaw = Math.round(existingCropX + relX / scaleX);
    const newCropYRaw = Math.round(existingCropY + relY / scaleY);

    const minCropX = existingCropX;
    const minCropY = existingCropY;
    const maxCropX = existingCropX + windowW - wPx;
    const maxCropY = existingCropY + windowH - hPx;

    const newCropX = Math.round(clamp(newCropXRaw, minCropX, maxCropX));
    const newCropY = Math.round(clamp(newCropYRaw, minCropY, maxCropY));

    // Ao confirmar, criamos um NOVO objeto de imagem com o crop aplicado e removemos o anterior.
    // Isso gera um gizmo novo e evita estados residuais do modo de corte.
    const newObj = replaceImageWithNewObject(img, () => {
      try {
        const fabric: any = fabricRef.current;
        const el = img.getElement?.() ?? img._element ?? img._originalElement;
        if (el && fabric?.Image) return new fabric.Image(el, {});
      } catch {}
      return null;
    });

    if (newObj) {
      copyBasicImageProps(img, newObj);
      try {
        newObj.set({ cropX: newCropX, cropY: newCropY, width: wPx, height: hPx });
        newObj.setCoords?.();
      } catch {}

      // Para evitar que o resultado "suma" fora da área visível após um zoom ancorado no cursor,
      // mantemos o comportamento de pós-corte: imagem centralizada no canvas.
      try { centerImageInCanvas(newObj); } catch {}
    }

    cleanupSquareCropPreview({ restoreImage: false });
    try { c.requestRenderAll?.(); } catch {}

    // captura histórico ao finalizar
    try {
      if (!isRestoringRef.current && !isLoadingRef.current) {
        historyRef.current?.push("crop-square");
        emitHistory();
      }
    } catch {}
  };

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
        "__moldaImageAdjustments",
        "__moldaImageEffects",
        "__moldaOriginalSrc",
        "__moldaHasPattern",
        "__moldaPatternTarget",
        "__moldaPatternUrl",
        "__moldaPatternRepeat",
        "__moldaPatternScale",
        "__moldaOriginalFill",
        "__moldaOriginalStroke",
        "__moldaLassoCropMeta",
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

  const emitTextStyleEvent = (type: "editor2d:activeTextStyle" | "editor2d:selectionStyle", style: TextStyle | null) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail: style || {} }));
    } catch {}
  };

  const emitFontUsed = (fontFamily?: string) => {
    const family = typeof fontFamily === "string" ? fontFamily.trim() : "";
    if (!family) return;
    try {
      window.dispatchEvent(new CustomEvent("editor2d:fontUsed", { detail: { fontFamily: family } }));
    } catch {}
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

    emitTextStyleEvent("editor2d:activeTextStyle", getActiveTextStyle());
    emitTextStyleEvent("editor2d:selectionStyle", getActiveTextStyle());
    emitFontUsed(nextPatch.fontFamily);
  };

  const applyTextStyle = (patch: TextStyle) => {
    void setActiveTextStyle(patch);
  };

  const deleteSelection = () => {
    const c = canvasRef.current;
    if (!c) return;

    const activeObjects: any[] =
      (typeof c.getActiveObjects === "function" ? c.getActiveObjects() : []) || [];
    const objects = activeObjects.length
      ? activeObjects
      : c.getActiveObject?.()
        ? [c.getActiveObject?.()]
        : [];
    if (!objects.length) return;

    const shouldPush = shouldRecordHistory();

    // Remove everything in the active selection as a single history entry.
    runSilently(() => {
      objects.forEach((obj: any) => {
        if (!obj) return;
        if (obj.__isPreview) return;
        try {
          c.remove(obj);
        } catch {}
      });
      try {
        c.discardActiveObject?.();
      } catch {}
    });

    try {
      c.requestRenderAll?.();
    } catch {}

    if (shouldPush) {
      try {
        historyRef.current?.push("remove");
      } catch {}
      emitHistory();
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
    const nc = new fabric.Canvas(el, getCanvasOptions());
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
    if (keydown && isActiveRef.current) window.addEventListener("keydown", keydown);
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
      // When scaling drawn objects we want the stroke width to scale too.
      // Using strokeUniform keeps stroke width constant and can "snap back" on mouse up.
      brush.strokeUniform = false;
    }
    return brush;
  };

  const applyStrokeMeta = (target: any, width: number) => {
    if (!target || typeof target.set !== "function") return;
    const patch: Record<string, any> = { strokeUniform: false };
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
      strokeUniform: false,
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
        strokeUniform: false,
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
          strokeUniform: false,
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
      strokeUniform: false,
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

          // guarda a origem para permitir re-aplicar filtros sem degradar (dataURL em cascata)
          try {
            (img as any).__moldaOriginalSrc = src;
          } catch {}
          c.add(img);
          c.setActiveObject(img);
          try { c.requestRenderAll?.(); } catch {}
        },
        { crossOrigin: "anonymous" }
      );
    }
  };

  const DEFAULT_IMAGE_ADJ: ImageAdjustments = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sepia: 0,
    grayscale: 0,
    hue: 0,
    sharpness: 0,
    definition: 0,
    highlights: 0,
    shadows: 0,
    blackPoint: 0,
    warmth: 0,
    tint: 0,
    shadowOn: false,
    shadowBlur: 12,
    shadowOpacity: 0.35,
  };

  const getSelectedImageObjects = (): any[] => {
    const c = canvasRef.current as any;
    if (!c) return [];
    const activeObjects: any[] = c.getActiveObjects ? c.getActiveObjects() : [];
    const isTextObject = (obj: any): boolean => {
      const t = String(obj?.type || "").toLowerCase();
      return t.includes("text");
    };
    const isImageObject = (obj: any): boolean => {
      const t = String(obj?.type || "").toLowerCase();
      if (t.includes("image")) return true;
      if (obj && obj._element) return true;
      return false;
    };
    const collectImageLeaves = (obj: any): any[] => {
      if (!obj) return [];
      if (isTextObject(obj)) return [];
      if (isImageObject(obj)) return [obj];
      const children: any[] = Array.isArray(obj._objects) ? obj._objects : [];
      if (children.length === 0) return [];
      return children.flatMap((c2) => collectImageLeaves(c2));
    };
    const out: any[] = [];
    const seen = new Set<any>();
    for (const o of activeObjects) {
      for (const leaf of collectImageLeaves(o)) {
        if (!seen.has(leaf)) {
          seen.add(leaf);
          out.push(leaf);
        }
      }
    }
    return out;
  };

  const getActiveImageAdjustments = (): ImageAdjustments | null => {
    const imgs = getSelectedImageObjects();
    if (imgs.length !== 1) return null;
    const img = imgs[0];
    const saved = (img as any).__moldaImageAdjustments as ImageAdjustments | undefined;
    return saved ? { ...DEFAULT_IMAGE_ADJ, ...saved } : { ...DEFAULT_IMAGE_ADJ };
  };

  const exportImageWithAdjustmentsToDataUrl = async (src: string, adj: ImageAdjustments): Promise<string> =>
    new Promise((resolve, reject) => {
      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas 2D não disponível"));

          const filterCss =
            `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) ` +
            `sepia(${adj.sepia}%) grayscale(${adj.grayscale}%) hue-rotate(${adj.hue}deg)`;

          try {
            (ctx as any).filter = filterCss;
          } catch {}

          ctx.drawImage(imgEl, 0, 0);

          const hasPixelStage =
            (adj.highlights ?? 0) !== 0 ||
            (adj.shadows ?? 0) !== 0 ||
            (adj.blackPoint ?? 0) !== 0 ||
            (adj.warmth ?? 0) !== 0 ||
            (adj.tint ?? 0) !== 0 ||
            (adj.definition ?? 0) !== 0 ||
            (adj.sharpness ?? 0) !== 0;

          if (!hasPixelStage) {
            resolve(canvas.toDataURL("image/png"));
            return;
          }

          const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
          const clamp255 = (n: number) => Math.max(0, Math.min(255, n));
          const smoothstep = (a: number, b: number, x: number) => {
            if (a === b) return x < a ? 0 : 1;
            const t = clamp01((x - a) / (b - a));
            return t * t * (3 - 2 * t);
          };

          const applyPixelStage = () => {
            const w = canvas.width;
            const h = canvas.height;
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;

            // --- Black point remap (pre-tone) ---
            const bpNorm = (Number(adj.blackPoint) || 0) / 100;
            // Limita para evitar extremos agressivos
            const inputMin = bpNorm * 0.25 * 255;
            const denom = 255 - inputMin;
            const remap = (v: number) => {
              if (denom === 0) return v;
              return ((v - inputMin) / denom) * 255;
            };

            const shadows = (Number(adj.shadows) || 0) / 100;
            const highlights = (Number(adj.highlights) || 0) / 100;
            const definition = (Number(adj.definition) || 0) / 100;
            const warmth = (Number(adj.warmth) || 0) / 100;
            const tint = (Number(adj.tint) || 0) / 100;

            for (let i = 0; i < data.length; i += 4) {
              let r = data[i] as number;
              let g = data[i + 1] as number;
              let b = data[i + 2] as number;

              // black point (range remap)
              if (bpNorm !== 0) {
                r = remap(r);
                g = remap(g);
                b = remap(b);
              }

              // luminance in [0..1]
              const rn = r / 255;
              const gn = g / 255;
              const bn = b / 255;
              let L = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;

              // shadows/highlights tone with soft weights
              if (shadows !== 0 || highlights !== 0 || definition !== 0) {
                const wSh = 1 - smoothstep(0.0, 0.55, L);
                const wHi = smoothstep(0.45, 1.0, L);

                let L2 = L;
                if (shadows !== 0) L2 = clamp01(L2 + shadows * 0.35 * wSh);
                if (highlights !== 0) L2 = clamp01(L2 + highlights * 0.35 * wHi);

                // "definição" = contraste principalmente nos médios
                if (definition !== 0) {
                  const wMid = 1 - Math.min(1, Math.abs(L2 - 0.5) * 2);
                  // pequena curva S ponderada nos médios
                  const contrast = 1 + definition * 0.8 * wMid;
                  L2 = clamp01(0.5 + (L2 - 0.5) * contrast);
                }

                const scale = L > 1e-6 ? L2 / L : 1;
                r = r * scale;
                g = g * scale;
                b = b * scale;
              }

              // warmth (temperature): +warm => more red/yellow, less blue
              if (warmth !== 0) {
                const k = warmth * 24; // ~[-24..24]
                r += k;
                g += k * 0.4;
                b -= k;
              }

              // tint: + => magenta, - => green
              if (tint !== 0) {
                const k = tint * 18; // ~[-18..18]
                r += k;
                b += k;
                g -= k;
              }

              data[i] = clamp255(r);
              data[i + 1] = clamp255(g);
              data[i + 2] = clamp255(b);
            }

            // --- Sharpness (unsharp mask) ---
            const sharpness = Number(adj.sharpness) || 0;
            if (sharpness > 0) {
              // box blur 3x3
              const srcData = new Uint8ClampedArray(data);
              const amount = Math.min(2, sharpness / 100 * 1.6);
              const idx = (x: number, y: number) => (y * w + x) * 4;

              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
                  for (let dy = -1; dy <= 1; dy++) {
                    const yy = y + dy;
                    if (yy < 0 || yy >= h) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                      const xx = x + dx;
                      if (xx < 0 || xx >= w) continue;
                      const j = idx(xx, yy);
                      rSum += srcData[j];
                      gSum += srcData[j + 1];
                      bSum += srcData[j + 2];
                      aSum += srcData[j + 3];
                      count++;
                    }
                  }
                  const j0 = idx(x, y);
                  const br = rSum / count;
                  const bg = gSum / count;
                  const bb = bSum / count;
                  const ba = aSum / count;

                  const or = srcData[j0];
                  const og = srcData[j0 + 1];
                  const ob = srcData[j0 + 2];
                  const oa = srcData[j0 + 3];

                  data[j0] = clamp255(or + (or - br) * amount);
                  data[j0 + 1] = clamp255(og + (og - bg) * amount);
                  data[j0 + 2] = clamp255(ob + (ob - bb) * amount);
                  data[j0 + 3] = clamp255(oa + (oa - ba) * (amount * 0.25));
                }
              }
            }

            ctx.putImageData(imageData, 0, 0);
          };

          applyPixelStage();
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      imgEl.onerror = () => reject(new Error("Falha ao carregar a imagem"));
      imgEl.src = src;
    });

  const processActiveImageAdjustments = async (adj: ImageAdjustments) => {
    const c = canvasRef.current as any;
    if (!c) return;

    // Identifica esta execução para consolidar commits do histórico.
    const opId = ++imageAdjOpIdRef.current;

    const imgs = getSelectedImageObjects();
    if (imgs.length === 0) return;

    const scheduleHistoryCommit = () => {
      if (isRestoringRef.current || isLoadingRef.current) return;
      if (imageAdjCommitTimerRef.current) {
        window.clearTimeout(imageAdjCommitTimerRef.current);
      }
      imageAdjCommitTimerRef.current = window.setTimeout(() => {
        if (imageAdjOpIdRef.current !== opId) return;
        imageAdjCommitTimerRef.current = null;
        if (shouldRecordHistory()) {
          historyRef.current?.push("image-adjust");
          emitHistory();
        }
      }, 250);
    };

    const isDefaultLevels = (next: ImageAdjustments) =>
      (next.brightness ?? 100) === 100 &&
      (next.contrast ?? 100) === 100 &&
      (next.saturation ?? 100) === 100 &&
      (next.sepia ?? 0) === 0 &&
      (next.grayscale ?? 0) === 0 &&
      (next.hue ?? 0) === 0 &&
      (next.sharpness ?? 0) === 0 &&
      (next.definition ?? 0) === 0 &&
      (next.highlights ?? 0) === 0 &&
      (next.shadows ?? 0) === 0 &&
      (next.blackPoint ?? 0) === 0 &&
      (next.warmth ?? 0) === 0 &&
      (next.tint ?? 0) === 0;

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const applyFabricShadow = (img: any, next: ImageAdjustments) => {
      const fabric = fabricRef.current as any;
      if (!fabric) return;

      const blur = Math.max(0, Number(next.shadowBlur) || 0);
      const opacity = clamp01(Number(next.shadowOpacity) || 0);
      const enabled = !!next.shadowOn && blur > 0 && opacity > 0;

      try {
        if (!enabled) {
          img.set?.("shadow", null);
          return;
        }
        const offset = Math.round(Math.max(2, blur / 3));
        const ShadowCtor = fabric.Shadow;
        if (typeof ShadowCtor === "function") {
          img.set?.(
            "shadow",
            new ShadowCtor({
              color: `rgba(0,0,0,${opacity})`,
              blur,
              offsetX: offset,
              offsetY: offset,
            })
          );
        } else {
          // fallback: objeto simples (algumas builds aceitam)
          img.set?.("shadow", {
            color: `rgba(0,0,0,${opacity})`,
            blur,
            offsetX: offset,
            offsetY: offset,
          });
        }
      } catch {}
    };

    const needsReencode = (prev: ImageAdjustments | undefined, next: ImageAdjustments) => {
      if (!prev) return true;
      return (
        prev.brightness !== next.brightness ||
        prev.contrast !== next.contrast ||
        prev.saturation !== next.saturation ||
        prev.sepia !== next.sepia ||
        prev.grayscale !== next.grayscale ||
        prev.hue !== next.hue ||
        prev.sharpness !== next.sharpness ||
        prev.definition !== next.definition ||
        prev.highlights !== next.highlights ||
        prev.shadows !== next.shadows ||
        prev.blackPoint !== next.blackPoint ||
        prev.warmth !== next.warmth ||
        prev.tint !== next.tint
      );
    };

    for (const img of imgs) {
      const prev = (img as any).__moldaImageAdjustments as ImageAdjustments | undefined;
      try {
        (img as any).__moldaImageAdjustments = { ...adj };
      } catch {}

      // Shadow é aplicado via Fabric para não recortar (clipping) e responder corretamente.
      applyFabricShadow(img, adj);
      try { c.requestRenderAll?.(); } catch {}

      // Reset para o default: volta para a imagem original (se disponível) sem re-encode.
      if (isDefaultLevels(adj)) {
        const originalSrc: string | undefined =
          (img as any).__moldaOriginalSrc || img?._originalElement?.src || img?._element?.src;
        if (originalSrc && typeof img?.setSrc === "function") {
          await new Promise<void>((resolve) => {
            img.setSrc(
              originalSrc,
              () => {
                try { c.requestRenderAll?.(); } catch {}
                resolve();
              },
              { crossOrigin: "anonymous" }
            );
          });
        }
        scheduleHistoryCommit();
        continue;
      }

      // Se só a sombra mudou, não precisa re-encode da imagem.
      if (!needsReencode(prev, adj)) {
        scheduleHistoryCommit();
        continue;
      }

      const originalSrc: string | undefined =
        (img as any).__moldaOriginalSrc || img?._originalElement?.src || img?._element?.src;
      if (!originalSrc) {
        scheduleHistoryCommit();
        continue;
      }

      try {
        const dataUrl = await exportImageWithAdjustmentsToDataUrl(originalSrc, adj);
        await new Promise<void>((resolve) => {
          if (typeof img?.setSrc === "function") {
            img.setSrc(
              dataUrl,
              () => {
                try { c.requestRenderAll?.(); } catch {}
                resolve();
              },
              { crossOrigin: "anonymous" }
            );
            return;
          }

          // fallback: troca o elemento e força render
          try {
            img._element = null;
          } catch {}
          resolve();
        });
      } catch {
        // ignora falhas (CORS etc.)
      }

      scheduleHistoryCommit();
    }
  };

  const applyActiveImageAdjustments = async (adj: ImageAdjustments) => {
    // Colapsa chamadas frequentes (drag do slider) para sempre aplicar o último valor.
    imageAdjPendingRef.current = { ...adj };
    if (imageAdjRunningRef.current) return;

    imageAdjRunningRef.current = true;
    try {
      while (imageAdjPendingRef.current) {
        const next = imageAdjPendingRef.current;
        imageAdjPendingRef.current = null;
        await processActiveImageAdjustments(next);
      }
    } finally {
      imageAdjRunningRef.current = false;
    }
  };

  // ===== Efeitos de imagem =====
  const DEFAULT_IMAGE_FX: ImageEffects = { kind: "none", amount: 1 };

  const getActiveImageEffects = (): ImageEffects | null => {
    const imgs = getSelectedImageObjects();
    if (imgs.length !== 1) return null;
    const img = imgs[0];
    const saved = (img as any).__moldaImageEffects as ImageEffects | undefined;
    return saved ? { ...DEFAULT_IMAGE_FX, ...saved } : { ...DEFAULT_IMAGE_FX };
  };

  const exportImageWithEffectsToDataUrl = async (
    src: string,
    adj: ImageAdjustments,
    fx: ImageEffects
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas 2D não disponível"));

          // Primeiro aplica níveis (adjustments)
          const filterCss =
            `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) ` +
            `sepia(${adj.sepia}%) grayscale(${adj.grayscale}%) hue-rotate(${adj.hue}deg)`;

          try {
            (ctx as any).filter = filterCss;
          } catch {}

          ctx.drawImage(imgEl, 0, 0);

          // Aplica efeito por pixels
          const kind = fx.kind ?? "none";
          const amount = typeof fx.amount === "number" ? fx.amount : 1;

          if (kind !== "none" && amount > 0) {
            const w = canvas.width;
            const h = canvas.height;
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            const clamp255 = (n: number) => Math.max(0, Math.min(255, n));

            for (let i = 0; i < data.length; i += 4) {
              let r = data[i];
              let g = data[i + 1];
              let b = data[i + 2];

              // Salva original para blend
              const or = r, og = g, ob = b;

              switch (kind) {
                case "grayscale": {
                  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                  r = g = b = gray;
                  break;
                }
                case "sepia": {
                  const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                  const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                  const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                  r = tr;
                  g = tg;
                  b = tb;
                  break;
                }
                case "invert": {
                  r = 255 - r;
                  g = 255 - g;
                  b = 255 - b;
                  break;
                }
                case "vintage": {
                  // Sepia + leve fade
                  const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                  const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                  const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                  r = tr * 0.9 + 25;
                  g = tg * 0.85 + 20;
                  b = tb * 0.8 + 15;
                  break;
                }
                case "cold": {
                  r = r * 0.9;
                  g = g * 0.95;
                  b = b * 1.1 + 10;
                  break;
                }
                case "warm": {
                  r = r * 1.1 + 10;
                  g = g * 1.02;
                  b = b * 0.9;
                  break;
                }
                case "dramatic": {
                  // Alto contraste + leve dessaturação
                  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                  r = r * 0.7 + gray * 0.3;
                  g = g * 0.7 + gray * 0.3;
                  b = b * 0.7 + gray * 0.3;
                  // Contraste
                  r = 128 + (r - 128) * 1.4;
                  g = 128 + (g - 128) * 1.4;
                  b = 128 + (b - 128) * 1.4;
                  break;
                }
                case "fade": {
                  r = r * 0.85 + 38;
                  g = g * 0.85 + 38;
                  b = b * 0.85 + 38;
                  break;
                }
                case "blur":
                case "sharpen":
                  // Estes seriam aplicados via convolução separada, por agora deixamos passar
                  break;
                case "vignette":
                  // Vinheta é aplicada via gradiente radial, não por pixel direto
                  break;
              }

              // Blend com intensidade (amount)
              r = or + (r - or) * amount;
              g = og + (g - og) * amount;
              b = ob + (b - ob) * amount;

              data[i] = clamp255(r);
              data[i + 1] = clamp255(g);
              data[i + 2] = clamp255(b);
            }

            // Vinheta (radial)
            if (kind === "vignette") {
              const cx = w / 2;
              const cy = h / 2;
              const maxDist = Math.sqrt(cx * cx + cy * cy);
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  const i = (y * w + x) * 4;
                  const dx = x - cx;
                  const dy = y - cy;
                  const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
                  const factor = 1 - Math.pow(dist, 1.5) * 0.7 * amount;
                  data[i] = clamp255(data[i] * factor);
                  data[i + 1] = clamp255(data[i + 1] * factor);
                  data[i + 2] = clamp255(data[i + 2] * factor);
                }
              }
            }

            // Blur (box blur simples)
            if (kind === "blur" && amount > 0) {
              const radius = Math.round(amount * 5);
              if (radius > 0) {
                const srcData = new Uint8ClampedArray(data);
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) {
                    let rSum = 0, gSum = 0, bSum = 0, count = 0;
                    for (let dy = -radius; dy <= radius; dy++) {
                      const yy = y + dy;
                      if (yy < 0 || yy >= h) continue;
                      for (let dx = -radius; dx <= radius; dx++) {
                        const xx = x + dx;
                        if (xx < 0 || xx >= w) continue;
                        const j = (yy * w + xx) * 4;
                        rSum += srcData[j];
                        gSum += srcData[j + 1];
                        bSum += srcData[j + 2];
                        count++;
                      }
                    }
                    const i = (y * w + x) * 4;
                    data[i] = rSum / count;
                    data[i + 1] = gSum / count;
                    data[i + 2] = bSum / count;
                  }
                }
              }
            }

            ctx.putImageData(imageData, 0, 0);
          }

          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      imgEl.onerror = () => reject(new Error("Falha ao carregar a imagem"));
      imgEl.src = src;
    });

  const processActiveImageEffects = async (fx: ImageEffects) => {
    const c = canvasRef.current as any;
    if (!c) return;

    const opId = ++imageAdjOpIdRef.current;
    const imgs = getSelectedImageObjects();
    if (imgs.length === 0) return;

    const scheduleHistoryCommit = () => {
      if (isRestoringRef.current || isLoadingRef.current) return;
      if (imageAdjCommitTimerRef.current) {
        window.clearTimeout(imageAdjCommitTimerRef.current);
      }
      imageAdjCommitTimerRef.current = window.setTimeout(() => {
        if (imageAdjOpIdRef.current !== opId) return;
        imageAdjCommitTimerRef.current = null;
        if (shouldRecordHistory()) {
          historyRef.current?.push("image-effect");
          emitHistory();
        }
      }, 250);
    };

    for (const img of imgs) {
      try {
        (img as any).__moldaImageEffects = { ...fx };
      } catch {}

      const kind = fx.kind ?? "none";
      const amount = typeof fx.amount === "number" ? fx.amount : 1;

      // Se efeito é "none" ou amount é 0, volta para níveis (ou original)
      if (kind === "none" || amount <= 0) {
        const adj: ImageAdjustments = (() => {
          const saved = (img as any).__moldaImageAdjustments as ImageAdjustments | undefined;
          return saved ? { ...DEFAULT_IMAGE_ADJ, ...saved } : { ...DEFAULT_IMAGE_ADJ };
        })();
        const originalSrc: string | undefined =
          (img as any).__moldaOriginalSrc || img?._originalElement?.src || img?._element?.src;
        if (originalSrc && typeof img?.setSrc === "function") {
          try {
            const dataUrl = await exportImageWithAdjustmentsToDataUrl(originalSrc, adj);
            await new Promise<void>((resolve) => {
              img.setSrc(dataUrl, () => {
                try { c.requestRenderAll?.(); } catch {}
                resolve();
              }, { crossOrigin: "anonymous" });
            });
          } catch {}
        }
        scheduleHistoryCommit();
        continue;
      }

      const adj: ImageAdjustments = (() => {
        const saved = (img as any).__moldaImageAdjustments as ImageAdjustments | undefined;
        return saved ? { ...DEFAULT_IMAGE_ADJ, ...saved } : { ...DEFAULT_IMAGE_ADJ };
      })();

      const originalSrc: string | undefined =
        (img as any).__moldaOriginalSrc || img?._originalElement?.src || img?._element?.src;
      if (!originalSrc) {
        scheduleHistoryCommit();
        continue;
      }

      try {
        const dataUrl = await exportImageWithEffectsToDataUrl(originalSrc, adj, fx);
        await new Promise<void>((resolve) => {
          if (typeof img?.setSrc === "function") {
            img.setSrc(dataUrl, () => {
              try { c.requestRenderAll?.(); } catch {}
              resolve();
            }, { crossOrigin: "anonymous" });
            return;
          }
          resolve();
        });
      } catch {}

      scheduleHistoryCommit();
    }
  };

  const applyActiveImageEffects = async (fx: ImageEffects) => {
    imageAdjPendingRef.current = null; // clear adjustments queue
    await processActiveImageEffects(fx);
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

  /**
   * Patterns were being clipped to the original object bounds because Fabric
   * kept using the cached bitmap generated before the resize.
   * Clearing every cache hook here guarantees a full redraw after scaling.
   */
  const invalidatePatternRendering = (obj: any) => {
    if (!obj) return;
    // Disable cached bitmaps so the pattern repaints using the new bounds
    obj.objectCaching = false;
    obj.statefullCache = false;
    // Allow Fabric to rebuild caches when scaling; keeping stale caches is a
    // common cause of clipped patterns after resize.
    obj.noScaleCache = false;
    obj.cacheTranslationX = 0;
    obj.cacheTranslationY = 0;
    obj.dirty = true;
    if (typeof obj._removeCache === "function") {
      try { obj._removeCache(); } catch {}
    }
    if (obj._cacheCanvas) obj._cacheCanvas = undefined;
    if (obj._cacheContext) obj._cacheContext = undefined;
    if (obj._cacheData) obj._cacheData = undefined;
    if (obj._boundingRect) obj._boundingRect = null;
    if (typeof obj.setCoords === "function") {
      try {
        obj.setCoords();
      } catch {}
    }
    // If the object belongs to a group, drop parent caches as well
    if (obj.group) {
      invalidatePatternRendering(obj.group);
    }
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
        // Pattern strokes + strokeUniform tend to produce clipped/incorrect
        // cached bounds during scaling. Let the stroke scale with the object.
        strokeUniform: false,
        strokeLineCap: "round",
        strokeLineJoin: "round",
      });
    } else {
      patch.fill = pattern;
    }
    obj.set(patch);
    // Centraliza a invalidação de cache/bounds em um único lugar
    // para evitar tentativas redundantes e chamadas a APIs privadas.
    invalidatePatternRendering(obj);
    if (saveMeta) {
      obj.__moldaHasPattern = true;
      obj.__moldaPatternTarget = target;
      obj.__moldaPatternUrl = meta.url;
      obj.__moldaPatternRepeat = meta.repeat;
      obj.__moldaPatternScale = meta.scale;
    }
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


  const computeSelectionKind = (): "none" | "text" | "image" | "other" => {
    const c = canvasRef.current as any;
    if (!c) return "none";
    const active: any = c.getActiveObject && c.getActiveObject();
    const activeObjects: any[] = c.getActiveObjects ? c.getActiveObjects() : [];
    if (!active || activeObjects.length === 0) return "none";

    const isTextObject = (obj: any): boolean => {
      const t = String(obj?.type || "").toLowerCase();
      return t.includes("text");
    };

    const isImageObject = (obj: any): boolean => {
      const t = String(obj?.type || "").toLowerCase();
      if (t.includes("image")) return true;
      // fallback: fabric.Image costuma ter _element
      if (obj && obj._element) return true;
      return false;
    };

    const allLeavesAreImages = (obj: any): boolean => {
      if (!obj) return false;
      if (isTextObject(obj)) return false;
      if (isImageObject(obj)) return true;
      const children: any[] = Array.isArray(obj._objects) ? obj._objects : [];
      if (children.length === 0) return false;
      return children.every((c) => allLeavesAreImages(c));
    };

    // Texto tem prioridade
    const hasText = activeObjects.some((o) => {
      if (isTextObject(o)) return true;
      const children: any[] = Array.isArray(o?._objects) ? o._objects : [];
      return children.some((c) => isTextObject(c));
    });
    if (hasText) return "text";

    const isImageSelection = activeObjects.every((o) => allLeavesAreImages(o));
    if (isImageSelection) return "image";

    return "other";
  };

  const notifySelectionKind = () => {
    const kind = computeSelectionKind();
    selectionListenersRef.current.forEach((cb) => {
      try { cb(kind); } catch {}
    });
    const style = kind === "text" ? getActiveTextStyle() : null;
    try {
      window.dispatchEvent(new CustomEvent("editor2d:selectionChange", { detail: { kind, ...((style && style.fontFamily) ? { fontFamily: style.fontFamily } : {}) } }));
    } catch {}
    if (style) {
      emitTextStyleEvent("editor2d:activeTextStyle", style);
      emitTextStyleEvent("editor2d:selectionStyle", style);
    }
  };

  const clipboardRef = useRef<any>(null);

  // Integrações com UI externa via eventos globais
  useEffect(() => {
    const emitCurrentTextStyle = () => {
      const kind = computeSelectionKind();
      const style = getActiveTextStyle();
      emitTextStyleEvent("editor2d:activeTextStyle", style);
      emitTextStyleEvent("editor2d:selectionStyle", style);
      try {
        window.dispatchEvent(
          new CustomEvent("editor2d:selectionChange", {
            detail: { kind, ...((style && style.fontFamily) ? { fontFamily: style.fontFamily } : {}) },
          })
        );
      } catch {}
    };

    const handleRequestStyle = () => {
      emitCurrentTextStyle();
    };

    const handleAddCenteredText = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const value = typeof detail?.value === "string" ? detail.value : "Digite aqui";
      addText(value);
    };

    const handleFontPicked = (ev: Event) => {
      const family = (ev as CustomEvent)?.detail?.fontFamily;
      if (typeof family === "string" && family.trim()) {
        applyTextStyle({ fontFamily: family });
        emitFontUsed(family);
      }
    };

    window.addEventListener("editor2d:requestActiveTextStyle", handleRequestStyle as EventListener);
    window.addEventListener("editor2d:addCenteredText", handleAddCenteredText as EventListener);
    window.addEventListener("editor2d:fontPickedFromSidebar", handleFontPicked as EventListener);

    return () => {
      window.removeEventListener("editor2d:requestActiveTextStyle", handleRequestStyle as EventListener);
      window.removeEventListener("editor2d:addCenteredText", handleAddCenteredText as EventListener);
      window.removeEventListener("editor2d:fontPickedFromSidebar", handleFontPicked as EventListener);
    };
  }, [applyTextStyle, addText]);

  // Fornece hook global usado pelo Sidebar/FontPicker
  useEffect(() => {
    (window as any).__editor2d_getActiveTextStyle = getActiveTextStyle;
    return () => {
      if ((window as any).__editor2d_getActiveTextStyle === getActiveTextStyle) {
        delete (window as any).__editor2d_getActiveTextStyle;
      }
    };
  }, []);

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
    getActiveImageAdjustments,
    applyActiveImageAdjustments,
    getActiveImageEffects,
    applyActiveImageEffects,
    startEffectBrush,
    cancelEffectBrush,
    isEffectBrushActive,
    startEffectLasso,
    cancelEffectLasso,
    isEffectLassoActive,
    startSquareCrop,
    cancelSquareCrop,
    startLassoCrop,
    startLassoCropReEdit,
    canReEditLassoCrop,
    cancelCrop,
    confirmCrop,
    isCropActive,
    undoLassoPoint,
    redoLassoPoint,
    canUndoLassoPoint,
    canRedoLassoPoint,
    undoSquareCropStep,
    redoSquareCropStep,
    canUndoSquareCropStep,
    canRedoSquareCropStep,
    onCropModeChange: (cb) => {
      cropModeListenersRef.current.add(cb);
    },
    onEffectEditModeChange: (cb) => {
      effectEditModeListenersRef.current.add(cb);
    },
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
  applyGizmoThemeToFabric(fabric);
        
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

          // CORREÇÃO CRÍTICA: Intercepta o prototype do Pattern para garantir renderização sem limitações
          // O problema é que o canvas do pattern é criado com tamanho baseado no objeto original
          // e não é atualizado quando o objeto é redimensionado
          try {
            if (fabric.Pattern && fabric.Pattern.prototype) {
              const PatternProto = fabric.Pattern.prototype as any;
              
              // Intercepta o método toLive que cria o canvas do pattern
              // Este método é chamado toda vez que o pattern é renderizado
              // CRÍTICO: O problema pode estar no canvas sendo criado com tamanho baseado na imagem original
              if (PatternProto.toLive && typeof PatternProto.toLive === "function" && !PatternProto.__moldaToLivePatched) {
                PatternProto.__moldaToLivePatched = true;
                const originalToLive = PatternProto.toLive;
                PatternProto.toLive = function(ctx: CanvasRenderingContext2D) {
                  try {
                    // CRÍTICO: Remove sourceRect ANTES de renderizar
                    // O sourceRect limita a área de renderização do pattern baseado no tamanho da imagem
                    if (this.sourceRect) {
                      delete this.sourceRect;
                    }
                    // CRÍTICO: Remove canvas cacheado para forçar recriação
                    // O canvas pode ter sido criado com tamanho baseado na imagem original (img.width, img.height)
                    // e não no tamanho atual do objeto
                    if (this._patternCanvas) {
                      const oldCanvas = this._patternCanvas;
                      delete this._patternCanvas;
                      // Se o canvas tinha tamanho limitado pela imagem, força recriação sem limitações
                    }
                    // CRÍTICO: Intercepta a criação do canvas para garantir que não use o tamanho da imagem como limite
                    // O método original pode estar criando um canvas com width/height baseados em this.source.width/height
                    // Precisamos garantir que o canvas seja criado sem essas limitações
                    const originalSource = this.source;
                    // Se source é uma imagem, não devemos usar suas dimensões para limitar o canvas
                    // O pattern deve ser renderizado em toda a extensão do objeto, não limitado pela imagem
                    
                    // Chama o método original
                    const result = originalToLive.call(this, ctx);
                    
                    // CRÍTICO: Após criar o canvas, garante que ele não tenha limitações de tamanho
                    if (this._patternCanvas) {
                      // O canvas pode ter sido criado com tamanho baseado na imagem
                      // Não podemos mudar o tamanho do canvas diretamente, mas podemos garantir
                      // que o sourceRect não limite a renderização
                      if (this.sourceRect) {
                        delete this.sourceRect;
                      }
                    }
                    
                    // Garante que sourceRect não seja recriado após renderização
                    if (this.sourceRect) {
                      delete this.sourceRect;
                    }
                    return result;
                  } catch (err) {
                    console.warn("[Editor2D] Error in toLive patch:", err);
                    return originalToLive.call(this, ctx);
                  }
                };
              }
              
              // Intercepta o método que cria o canvas do pattern se existir
              // Este método pode estar criando o canvas com tamanho baseado na imagem
              // CRÍTICO: O problema está aqui - o canvas é criado com tamanho baseado na imagem (img.width, img.height)
              // e não no tamanho do objeto, causando o corte quando o objeto é redimensionado
              if (PatternProto._getPatternCanvas && typeof PatternProto._getPatternCanvas === "function" && !PatternProto.__moldaGetPatternCanvasPatched) {
                PatternProto.__moldaGetPatternCanvasPatched = true;
                const originalGetPatternCanvas = PatternProto._getPatternCanvas;
                PatternProto._getPatternCanvas = function() {
                  try {
                    // Remove sourceRect antes de criar o canvas
                    // O sourceRect pode estar sendo definido com base no tamanho da imagem
                    if (this.sourceRect) {
                      delete this.sourceRect;
                    }
                    // CRÍTICO: Se source é uma imagem, não devemos usar suas dimensões para limitar o canvas
                    // O canvas deve ser criado sem limitações de tamanho baseadas na imagem
                    const originalSource = this.source;
                    // Temporariamente remove informações de tamanho da imagem para evitar limitações
                    let savedWidth, savedHeight;
                    if (originalSource && typeof originalSource === "object" && "width" in originalSource && "height" in originalSource) {
                      // Não podemos modificar a imagem diretamente, mas podemos garantir
                      // que o sourceRect não seja criado com base nela
                    }
                    
                    // Chama o método original
                    const canvas = originalGetPatternCanvas.call(this);
                    
                    // CRÍTICO: Após criar o canvas, verifica se ele foi criado com tamanho limitado pela imagem
                    // Se o canvas tem width/height iguais à imagem, isso pode estar limitando a renderização
                    if (canvas && originalSource) {
                      const imgWidth = originalSource.width || 0;
                      const imgHeight = originalSource.height || 0;
                      // Se o canvas foi criado com tamanho igual à imagem, isso pode estar causando o problema
                      // Mas não podemos simplesmente mudar o tamanho do canvas, pois isso quebraria o pattern
                      // Em vez disso, garantimos que o sourceRect não limite a renderização
                      if (this.sourceRect) {
                        delete this.sourceRect;
                      }
                    }
                    
                    return canvas;
                  } catch (err) {
                    console.warn("[Editor2D] Error in _getPatternCanvas patch:", err);
                    return originalGetPatternCanvas.call(this);
                  }
                };
              }
            }
          } catch (err) {
            console.warn("[Editor2D] Failed to patch Pattern.prototype.toLive:", err);
          }

          fabricRef.current = fabric;

        const el = document.createElement("canvas");
        el.style.width = "100%";
        el.style.height = "100%";
        el.width = hostRef.current.clientWidth;
        el.height = hostRef.current.clientHeight;
        hostRef.current.appendChild(el);

        const c = new fabric.Canvas(el, getCanvasOptions());
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
        const __onAdded = (evt?: any) => {
          // IMPORTANTE: strokes (lápis/spray/eraser) disparam object:added + path:created.
          // Se gravarmos histórico aqui e também em path:created, o usuário precisa de 2 undos.
          const target = evt?.target;
          const isPath = !!target && String(target.type || "").toLowerCase() === "path";

          if (shouldRecordHistory() && !isPath) {
            historyRef.current?.push("add");
          }
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

        const __onScaling = (evt: any) => {
          const target = evt?.target;
          if (!target) return;
          // CRÍTICO: Quando um objeto é redimensionado, o canvas do pattern precisa ser recriado
          // O canvas pode ter sido criado com tamanho baseado no objeto original
          visitLeafObjects(target, (obj: any) => {
            if (!obj || !obj.__moldaHasPattern) return;
           // Remove canvas do pattern para forçar recriação
            const fill = obj.fill;
            const stroke = obj.stroke;
           if (fill && typeof fill === "object" && fill._patternCanvas) {
             delete fill._patternCanvas;
            }
            if (fill && typeof fill === "object" && fill.sourceRect) {
              delete fill.sourceRect;
            }
            if (stroke && typeof stroke === "object" && stroke._patternCanvas) {
              delete stroke._patternCanvas;
            }
            if (stroke && typeof stroke === "object" && stroke.sourceRect) {
              delete stroke.sourceRect;
            }
            invalidatePatternRendering(obj);
            // CRÍTICO: Atualiza o bounding box para garantir que corresponda ao tamanho real
            // O problema pode estar no bounding box não correspondendo ao tamanho real do objeto
            if (typeof obj.setCoords === "function") {
              try {
                obj.setCoords();
                // Força recálculo do bounding box
                if (typeof obj.calcCoords === "function") {
                  obj.calcCoords();
                }
              } catch {}
            }
            // Invalida cache do bounding box
            if (obj._boundingRect) {
              obj._boundingRect = null;
            }
            // Marca o objeto como dirty para forçar re-renderização
            obj.dirty = true;
          });
        };

        const __onWheelScale = (opt: any) => {
          const evt: WheelEvent | undefined = opt?.e;
          if (!evt) return;
          if (!isActiveRef.current) return;

          // Do not hijack pinch-zoom / browser zoom gestures.
          if ((evt as any).ctrlKey || (evt as any).metaKey) return;

          // Crop tools: wheel zoom behaves differently (zoom to cursor; zoom out recenters).
          const cropSession = squareCropRef.current;
          const lassoSession = lassoCropRef.current;
          const effectSession = effectBrushRef.current;
          const effectLassoSession = effectLassoRef.current;
          const isSquareCropActive = !!cropSession?.active;
          const isLassoCropActive = !!lassoSession?.active;
          const isEffectBrushActive = !!effectSession?.active;

          const isEffectLassoActive = !!effectLassoSession?.active;

          if (isSquareCropActive || isLassoCropActive || isEffectBrushActive || isEffectLassoActive) {
            const s: any = isSquareCropActive
              ? cropSession
              : (isLassoCropActive
                ? lassoSession
                : (isEffectBrushActive ? effectSession : effectLassoSession));
            const img: any = s?.img;
            if (!img) return;

            const dy = Number((evt as any).deltaY ?? 0);
            if (!Number.isFinite(dy) || dy === 0) return;

            const stepMagnitude = Math.min(10, Math.max(0.1, Math.abs(dy) / 100));
            const step = dy > 0 ? 0.95 : 1.05;
            const factor = Math.pow(step, stepMagnitude);

            const scaleX0 = Number(img.scaleX ?? 1) || 1;
            const scaleY0 = Number(img.scaleY ?? 1) || 1;
            const minScale = 0.05;
            const maxScale = 20;
            const nextScaleX = clamp(scaleX0 * factor, minScale, maxScale);
            const nextScaleY = clamp(scaleY0 * factor, minScale, maxScale);

            // Square crop: group wheel gesture into the crop's internal undo stack.
            if (isSquareCropActive) {
              try {
                if (!s.isAdjusting) {
                  s.isAdjusting = true;
                  const prev = s.lastRecorded ?? normalizeSquareCropSnapshot(getSquareCropSnapshot(s));
                  s.undoStack.push(prev);
                  if (s.undoStack.length > MAX_SQUARE_CROP_UNDO) s.undoStack.shift();
                  s.redoStack = [];
                }
              } catch {}
            }

            // Pointer in canvas coordinates.
            let pointer = { x: 0, y: 0 };
            try {
              const p = c.getPointer?.(evt);
              if (p && typeof p.x === "number" && typeof p.y === "number") pointer = { x: p.x, y: p.y };
            } catch {}
            if ((pointer.x === 0 && pointer.y === 0) && opt?.pointer && typeof opt.pointer.x === "number") {
              pointer = { x: opt.pointer.x, y: opt.pointer.y };
            }

            runSilently(() => {
              const imgCenter = getObjectCenter(img);
              // Zoom in: toward cursor (anchor zoom at mouse position).
              if (factor > 1) {
                const fabric: any = fabricRef.current;
                const canScaleToPoint = typeof img.scaleToPoint === "function" && fabric?.Point;
                if (canScaleToPoint) {
                  try {
                    const pt = new fabric.Point(pointer.x, pointer.y);
                    // Use uniform scaling around the cursor.
                    img.scaleToPoint(pt, nextScaleX);
                    img.set?.({ scaleX: nextScaleX, scaleY: nextScaleY });
                  } catch {
                    try { img.set?.({ scaleX: nextScaleX, scaleY: nextScaleY }); } catch {}
                  }
                } else {
                  // Fallback: uniform scale + translate opposite the cursor vector.
                  const center = imgCenter;
                  const scaleRatio = scaleX0 > 0 ? nextScaleX / scaleX0 : 1;
                  const dx = pointer.x - center.x;
                  const dy2 = pointer.y - center.y;
                  const nextCenter = { x: center.x - dx * (scaleRatio - 1), y: center.y - dy2 * (scaleRatio - 1) };
                  try { img.set?.({ scaleX: nextScaleX, scaleY: nextScaleY }); } catch {}
                  try {
                    const fabric: any = fabricRef.current;
                    if (fabric?.Point && typeof img.setPositionByOrigin === "function") {
                      img.setPositionByOrigin(new fabric.Point(nextCenter.x, nextCenter.y), "center", "center");
                    } else {
                      img.left = nextCenter.x;
                      img.top = nextCenter.y;
                    }
                  } catch {}
                }
              } else {
                // Zoom out: scale now, but only recenter AFTER the gesture ends (debounce)
                // while gently pulling the image back toward the canvas center (no sudden snap).
                const fabric: any = fabricRef.current;
                const canScaleToPoint = typeof img.scaleToPoint === "function" && fabric?.Point;
                if (canScaleToPoint) {
                  try {
                    // Keep the image center stable during zoom-out to prevent drift/inverted movement.
                    const pt = new fabric.Point(imgCenter.x, imgCenter.y);
                    img.scaleToPoint(pt, nextScaleX);
                    img.set?.({ scaleX: nextScaleX, scaleY: nextScaleY });
                  } catch {
                    try { img.set?.({ scaleX: nextScaleX, scaleY: nextScaleY }); } catch {}
                  }
                } else {
                  try { img.set?.({ scaleX: nextScaleX, scaleY: nextScaleY }); } catch {}
                  try {
                    if (fabric?.Point && typeof img.setPositionByOrigin === "function") {
                      img.setPositionByOrigin(new fabric.Point(imgCenter.x, imgCenter.y), "center", "center");
                    } else {
                      img.left = imgCenter.x;
                      img.top = imgCenter.y;
                    }
                  } catch {}
                }

                // Gentle recentering during zoom-out: move a fraction toward the canvas center.
                try {
                  const centerAfter = getObjectCenter(img);
                  const canvasCenter = { x: c.getWidth() / 2, y: c.getHeight() / 2 };
                  const pull = clamp((1 - factor) * 1.5, 0.08, 0.35);
                  const nextCenter = {
                    x: centerAfter.x + (canvasCenter.x - centerAfter.x) * pull,
                    y: centerAfter.y + (canvasCenter.y - centerAfter.y) * pull,
                  };
                  if (fabric?.Point && typeof img.setPositionByOrigin === "function") {
                    img.setPositionByOrigin(new fabric.Point(nextCenter.x, nextCenter.y), "center", "center");
                  } else {
                    img.left = nextCenter.x;
                    img.top = nextCenter.y;
                  }
                } catch {}
              }

              try { img.setCoords?.(); } catch {}
            });

            // Refresh crop UI from image without forcing centering on zoom-in.
            try {
              s.imageRect = getImageRect(img);
            } catch {}
            if (isSquareCropActive) {
              try {
                runSilently(() => {
                  try {
                    s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
                    s.highlight.setCoords?.();
                  } catch {}
                  try {
                    const l = s.imageRect.left;
                    const t = s.imageRect.top;
                    const r = s.imageRect.left + s.imageRect.width;
                    const b = s.imageRect.top + s.imageRect.height;
                    s.imgHandles.tl.set({ left: l, top: t });
                    s.imgHandles.tr.set({ left: r, top: t });
                    s.imgHandles.bl.set({ left: l, top: b });
                    s.imgHandles.br.set({ left: r, top: b });
                    s.imgHandles.tl.setCoords?.();
                    s.imgHandles.tr.setCoords?.();
                    s.imgHandles.bl.setCoords?.();
                    s.imgHandles.br.setCoords?.();
                  } catch {}
                });
              } catch {}

              try { updateSquareCropPreview(); } catch {}

              // End gesture after idle; keep snapshot up to date.
              if (wheelScaleCommitTimerRef.current) {
                window.clearTimeout(wheelScaleCommitTimerRef.current);
                wheelScaleCommitTimerRef.current = null;
              }
              wheelScaleCommitTimerRef.current = window.setTimeout(() => {
                wheelScaleCommitTimerRef.current = null;
                const ss = squareCropRef.current;
                if (!ss?.active) return;
                ss.isAdjusting = false;
                try {
                  ss.lastRecorded = normalizeSquareCropSnapshot(getSquareCropSnapshot(ss));
                } catch {}
              }, 250);
            } else if (isLassoCropActive) {
              // Lasso crop UI refresh.
              try {
                runSilently(() => {
                  try {
                    s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
                    s.highlight.setCoords?.();
                  } catch {}
                  try {
                    const l = s.imageRect.left;
                    const t = s.imageRect.top;
                    const r = s.imageRect.left + s.imageRect.width;
                    const b = s.imageRect.top + s.imageRect.height;
                    s.imgHandles.tl.set({ left: l, top: t });
                    s.imgHandles.tr.set({ left: r, top: t });
                    s.imgHandles.bl.set({ left: l, top: b });
                    s.imgHandles.br.set({ left: r, top: b });
                    s.imgHandles.tl.setCoords?.();
                    s.imgHandles.tr.setCoords?.();
                    s.imgHandles.bl.setCoords?.();
                    s.imgHandles.br.setCoords?.();
                  } catch {}
                });
              } catch {}

              // Pontos do laço precisam acompanhar a imagem após zoom/move.
              try { updateLassoGraphics(); } catch {}
            } else if (isEffectBrushActive || isEffectLassoActive) {
              // Effect brush UI refresh.
              try {
                runSilently(() => {
                  try {
                    s.highlight.set({ left: s.imageRect.left, top: s.imageRect.top, width: s.imageRect.width, height: s.imageRect.height });
                    s.highlight.setCoords?.();
                  } catch {}
                  try {
                    const l = s.imageRect.left;
                    const t = s.imageRect.top;
                    const r = s.imageRect.left + s.imageRect.width;
                    const b = s.imageRect.top + s.imageRect.height;
                    s.imgHandles.tl.set({ left: l, top: t });
                    s.imgHandles.tr.set({ left: r, top: t });
                    s.imgHandles.bl.set({ left: l, top: b });
                    s.imgHandles.br.set({ left: r, top: b });
                    s.imgHandles.tl.setCoords?.();
                    s.imgHandles.tr.setCoords?.();
                    s.imgHandles.bl.setCoords?.();
                    s.imgHandles.br.setCoords?.();
                  } catch {}
                });
              } catch {}
            }

            try { c.requestRenderAll?.(); } catch {}

            try {
              evt.preventDefault();
              evt.stopPropagation();
            } catch {}
            return;
          }

          const active: any = c.getActiveObject?.();
          if (!active) return;

          // If user is currently editing text, allow normal scrolling.
          const isTextEditing =
            !!active &&
            (active.isEditing === true ||
              (typeof active.enterEditing === "function" && active.hiddenTextarea));
          if (isTextEditing) return;

          // Respect locked scaling.
          if (active.lockScalingX && active.lockScalingY) return;
          if (active.selectable === false || active.evented === false) return;

          const dy = Number((evt as any).deltaY ?? 0);
          if (!Number.isFinite(dy) || dy === 0) return;

          // One "notch" is usually ~100. Use an exponential step so trackpads feel smooth.
          const stepMagnitude = Math.min(10, Math.max(0.1, Math.abs(dy) / 100));
          const step = dy > 0 ? 0.95 : 1.05;
          const factor = Math.pow(step, stepMagnitude);

          const scaleX0 = Number(active.scaleX ?? 1) || 1;
          const scaleY0 = Number(active.scaleY ?? 1) || 1;
          const minScale = 0.05;
          const maxScale = 20;
          const nextScaleX = clamp(scaleX0 * factor, minScale, maxScale);
          const nextScaleY = clamp(scaleY0 * factor, minScale, maxScale);

          // Preserve center so scaling feels natural.
          const center = typeof active.getCenterPoint === "function" ? active.getCenterPoint() : null;
          try {
            active.set?.({ scaleX: nextScaleX, scaleY: nextScaleY });
          } catch {
            try {
              active.scaleX = nextScaleX;
              active.scaleY = nextScaleY;
            } catch {}
          }
          if (center && typeof active.setPositionByOrigin === "function") {
            try {
              active.setPositionByOrigin(center, "center", "center");
            } catch {}
          }
          try { active.setCoords?.(); } catch {}

          // Reuse existing scaling listeners (e.g. pattern invalidation).
          try {
            c.fire?.("object:scaling", { target: active });
          } catch {}

          try { c.requestRenderAll?.(); } catch {}

          try {
            evt.preventDefault();
            evt.stopPropagation();
          } catch {}

          // Debounce history so a scroll gesture becomes a single undo step.
          if (wheelScaleCommitTimerRef.current) {
            window.clearTimeout(wheelScaleCommitTimerRef.current);
            wheelScaleCommitTimerRef.current = null;
          }
          wheelScaleCommitTimerRef.current = window.setTimeout(() => {
            wheelScaleCommitTimerRef.current = null;
            if (shouldRecordHistory()) {
              try {
                historyRef.current?.push("scale-wheel");
              } catch {}
              emitHistory();
            }
          }, 250);
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
        c.on("object:scaling", __onScaling);
        c.on("mouse:wheel", __onWheelScale);

        setCanvasReady(true);
        console.log("[Editor2D] Canvas ready set to true");

      } catch (err) {
        console.error("[Editor2D] init: erro", err);
      }
    };

    init();

    return () => {
      disposed = true;
      if (imageAdjCommitTimerRef.current) {
        window.clearTimeout(imageAdjCommitTimerRef.current);
        imageAdjCommitTimerRef.current = null;
      }
      if (wheelScaleCommitTimerRef.current) {
        window.clearTimeout(wheelScaleCommitTimerRef.current);
        wheelScaleCommitTimerRef.current = null;
      }
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
        detachLineListeners(c);
        c.off("object:added");
        c.off("object:removed");
        c.off("object:modified");
        c.off("path:created");
        c.off("erasing:start");
        c.off("erasing:end");
        c.off("object:moving");
        c.off("object:rotating");
        c.off("object:scaling");
        c.off("mouse:wheel");
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
          strokeUniform: false,
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
          strokeUniform: false,
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

        if (evt.key === "Delete" || evt.key === "Backspace") {
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
          try {
            onRequestToolChangeRef.current?.("select");
          } catch {}
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

  }, [tool, brushVariant, strokeColor, strokeWidth, opacity, canvasReady, continuousLineMode, isActive]);

  // Atalhos de teclado para undo/redo
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      // Se estiver no modo de corte (laço ou quadrado), não processa undo/redo global
      // O handler em onGlobalKeyDown cuida do undo/redo dos pontos do laço
      if (lassoCropRef.current?.active || squareCropRef.current?.active) return;
      
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
  }, [isActive]);

  return (
    <div
      ref={hostRef}
      className="w-full h-full"
      style={{ background: "transparent", touchAction: "none" }}
    />
  );
});

export default Editor2D;
