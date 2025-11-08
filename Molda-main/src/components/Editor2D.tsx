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
import { generateBlobSvgDataUrl } from "../lib/shapeGenerators";

// Tipos alinhados com ExpandableSidebar
export type Tool = "select" | "brush" | "line" | "curve" | "text";
export type BrushVariant = "pencil" | "spray" | "eraser" | "calligraphy";
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

export type SelectionInfo = {
  hasSelection: boolean;
  count: number;
  isGroup: boolean;
  isMulti: boolean;
  isTextSelection: boolean;
  isFullyLocked: boolean;
  canGroup: boolean;
  canBringForward: boolean;
  canSendBackward: boolean;
  canBringToFront: boolean;
  canSendToBack: boolean;
  hasClipboard: boolean;
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
  /** Força re-measure, calcOffset e renderAll (útil ao voltar para a aba) */
  refresh: () => void;
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
    opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }
  ) => void;

  toJSON: () => string;
  loadFromJSON: (json: string) => Promise<void>;
  deleteSelection: () => void;

  // ---- Edição direta ----
  copySelection: () => Promise<boolean>;
  pasteSelection: (opts?: { offset?: number }) => Promise<boolean>;
  duplicateSelection: () => Promise<boolean>;
  toggleLockSelection: (lockState?: boolean) => void;
  bringSelectionForward: () => void;
  sendSelectionBackward: () => void;
  bringSelectionToFront: () => void;
  sendSelectionToBack: () => void;
  groupSelection: () => void;
  getSelectionInfo: () => SelectionInfo;

  // ==== Texto ====
  addText: (value?: string, opts?: { x?: number; y?: number }) => void;

  /** leitura/aplicação de estilo do texto ativo */
  getActiveTextStyle: () => TextStyle | null;
  setActiveTextStyle: (patch: TextStyle & { from?: "font-picker" | "inspector" }) => Promise<void>;

  /** lista famílias de fonte atualmente presentes no canvas */
  listUsedFonts: () => string[];

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
let fabricModulePromise: Promise<any> | null = null;

// Avoid mutating the Fabric namespace (may be sealed/freezed in some builds).
// Cache custom brush constructors per Fabric module via WeakMap.
const __SprayBrushExCache = new WeakMap<any, any>();
const __CalligraphyBrushCache = new WeakMap<any, any>();
const __LiveEraserBrushCache = new WeakMap<any, any>();

async function loadFabricRuntime(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Fabric requer ambiente de navegador");
  }

  const globalFabric = (window as any).fabric;
  if (globalFabric && typeof globalFabric.Canvas === "function") {
    return globalFabric;
  }

  if (fabricModulePromise) {
    return fabricModulePromise;
  }

  const tryCdnFallback = () => {
    const cdns = [
      // Preferimos UMD estável para evitar incompatibilidades de ESM
      "https://unpkg.com/fabric@5.3.0/dist/fabric.min.js",
      "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js",
      // Tentativa com v6 UMD (se disponível no CDN)
      "https://unpkg.com/fabric@6.0.0/dist/fabric.min.js",
    ];

    const loadFrom = (i: number): Promise<any> =>
      new Promise((resolve, reject) => {
        if (i >= cdns.length) {
          reject(new Error("Falha ao carregar Fabric de CDNs."));
          return;
        }
        const script = document.createElement("script");
        script.src = cdns[i];
        script.async = true;
        script.onload = () => {
          const loadedFabric = (window as any).fabric;
          if (loadedFabric && typeof loadedFabric.Canvas === "function") {
            resolve(loadedFabric);
          } else {
            reject(new Error("Fabric não disponível/compatível após load."));
          }
        };
        script.onerror = () => {
          try { document.head.removeChild(script); } catch {}
          loadFrom(i + 1).then(resolve).catch(reject);
        };
        document.head.appendChild(script);
      });

    return loadFrom(0);
  };

  const tryModuleImport = async () => {
    const mod = await import("fabric");
    // Possíveis formatos: { fabric: {...} } | default | namespace com Canvas
    const maybe = (mod as any).fabric ?? (mod as any).default ?? mod;

    // Caso 1: objeto com Canvas construtor
    if (maybe && typeof (maybe as any).Canvas === "function") {
      (window as any).fabric = maybe;
      return maybe;
    }
    // Caso 2: namespace ESM com export nomeado Canvas
    if ((mod as any).Canvas && typeof (mod as any).Canvas === "function") {
      (window as any).fabric = mod as any;
      return mod as any;
    }
    // Caso 3: algum polyfill já expôs global válido
    if ((window as any).fabric && typeof (window as any).fabric.Canvas === "function") {
      return (window as any).fabric;
    }
    throw new Error("Módulo fabric com formato inesperado");
  };

  fabricModulePromise = (async () => {
    try {
      // Tenta primeiro via import; se falhar, recorre ao CDN UMD estável
      return await tryModuleImport();
    } catch {
      return await tryCdnFallback();
    }
  })();

  try {
    const fabricExport = await fabricModulePromise;
    return fabricExport;
  } catch (err) {
    fabricModulePromise = null;
    throw err;
  }
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
      const meta = (active as any).data as Record<string, unknown> | null | undefined;

      if (meta?.kind === "blob") {
        let blobChanged = false;
        if (typeof active.set === "function" && active.opacity !== opacity) {
          active.set({ opacity });
          blobChanged = true;
        }

        const fillMode = (meta.fillMode as string) === "transparent" ? "transparent" : "solid";
        const desiredFill = fillMode === "transparent" ? "none" : strokeColor;
        const desiredStroke = strokeColor;
        const prevFill = (meta as any).currentFill ?? (meta as any).initialFill ?? null;
        const prevStroke = (meta as any).currentStroke ?? (meta as any).initialStroke ?? null;
        const prevStrokeWidth = (meta as any).currentStrokeWidth ?? (meta as any).strokeWidth ?? null;
        const desiredStrokeWidth = Number.isFinite(strokeWidth) ? strokeWidth : prevStrokeWidth ?? 2;

        if (
          prevFill !== desiredFill ||
          prevStroke !== desiredStroke ||
          prevStrokeWidth !== desiredStrokeWidth
        ) {
          const size = typeof meta.baseSize === "number" ? (meta.baseSize as number) : 320;
          const seed = typeof meta.seed === "number" ? (meta.seed as number) : 0;
          const nextUrl = generateBlobSvgDataUrl({
            size,
            seed,
            fill: desiredFill,
            stroke: desiredStroke,
            strokeWidth: desiredStrokeWidth,
          });
          if (typeof (active as any).setSrc === "function") {
            (active as any).setSrc(nextUrl, () => {
              c.requestRenderAll?.();
            });
          }
          (active as any).data = {
            ...meta,
            currentFill: desiredFill,
            currentStroke: desiredStroke,
            currentStrokeWidth: desiredStrokeWidth,
          };
          blobChanged = true;
        }

        if (blobChanged) {
          setTimeout(() => {
            c.setActiveObject(active);
            c.requestRenderAll?.();
          }, 0);
        }
        return;
      }

      if (active.type === "image") {
        let imgChanged = false;
        if (typeof active.set === "function" && active.opacity !== opacity) {
          active.set({ opacity });
          imgChanged = true;
        }
        if (imgChanged) {
          setTimeout(() => {
            c.setActiveObject(active);
            c.requestRenderAll?.();
          }, 0);
        }
        return;
      }

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
  const [isCanvasReady, setCanvasReady] = useState(false);
  const fabricRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const listenersRef = useRef<{ down?: any; move?: any; up?: any }>({});
  const strokeColorRef = useRef(strokeColor);
  React.useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);
  const clipboardRef = useRef<{ object: any; left: number; top: number } | null>(null);
  const eraserOverlayRef = useRef<HTMLDivElement | null>(null);
  const eraserActiveRef = useRef(false);
  const usingNativeEraserRef = useRef(false);
  const strokeWidthRef = useRef(strokeWidth);
  React.useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  React.useEffect(() => {
    if (!eraserActiveRef.current || !eraserOverlayRef.current) return;
    const cursor = eraserOverlayRef.current.firstElementChild as HTMLDivElement | null;
    if (!cursor) return;
    const size = Math.max(10, strokeWidth * 2);
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
    const cx = Number(cursor.dataset.cx || "0");
    const cy = Number(cursor.dataset.cy || "0");
    cursor.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px)`;
  }, [strokeWidth]);

  // NOVO: listeners externos para mudanças de seleção
  const selectionListenersRef = useRef(new Set<(k: "none" | "text" | "other") => void>());

  // ---------------------- Funções públicas auxiliares ----------------------

  const addImage = (
    src: string,
    opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }
  ) => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    const placeFabricImage = (img: any) => {
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
        erasable: true,
        data: opts?.meta ?? null,
        stroke: undefined,
        strokeWidth: 0,
      });
      c.add(img);
      c.setActiveObject(img);
      c.requestRenderAll?.();
    };

    const fetchAsDataURL = async (url: string): Promise<string> => {
      const res = await fetch(url, { mode: "cors" }).catch(() => fetch(url));
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.readAsDataURL(blob);
      });
    };

    // Pré-carregador de imagem com fallback para data URL, evitando depender de exceptions síncronas
    const preloadImage = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous"; // tenta CORS amigável
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image-load-error"));
        el.src = url;
      });

    if (c && fabric) {
      (async () => {
        try {
          // 1) tenta carregar direto a URL
          const el = await preloadImage(src);
          const fabImg = new fabric.Image(el);
          placeFabricImage(fabImg);
        } catch (_) {
          try {
            // 2) fallback: busca como dataURL e carrega novamente
            const dataUrl = await fetchAsDataURL(src);
            const el2 = await preloadImage(dataUrl);
            const fabImg2 = new fabric.Image(el2);
            placeFabricImage(fabImg2);
          } catch {
            // mantém silêncio para não quebrar UX
          }
        }
      })();
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

  const ensureInteractivity = (c: any) => {
    try {
      if (c?.upperCanvasEl) c.upperCanvasEl.style.pointerEvents = "auto";
      if (c?.lowerCanvasEl) c.lowerCanvasEl.style.pointerEvents = "auto";
      if ((c as any)?.wrapperEl) (c as any).wrapperEl.style.pointerEvents = "auto";
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
      const isLiveEraserPath = !!(o?.data && o.data.__liveEraser);
      const isDestinationOut = o?.globalCompositeOperation === "destination-out";
      if (isDestinationOut && !o?.data) {
        o.data = { __liveEraser: true };
      }
      if (isLiveEraserPath) {
        // Mantém artefatos do apagador invisíveis à seleção
        o.selectable = false;
        o.evented = false;
        return;
      }
      o.selectable = value;
      o.evented = value;
    });
  };

  const setHiddenProperty = (obj: any, key: string, value: any) => {
    if (!obj) return;
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (!desc || desc.configurable) {
        Object.defineProperty(obj, key, {
          value,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      } else {
        (obj as any)[key] = value;
      }
    } catch {
      (obj as any)[key] = value;
    }
  };

  const getHiddenProperty = (obj: any, key: string) => {
    if (!obj) return undefined;
    try {
      return (obj as any)[key];
    } catch {
      return undefined;
    }
  };

  const LOCK_SNAPSHOT_KEY = "__moldaLockSnapshot";
  const isLiveEraserObject = (obj: any) => !!(obj?.data && obj.data.__liveEraser);

  const getCanvasSelection = () => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject?.() ?? null;
    if (!canvas || !active) {
      return { canvas: null as any, active: null as any, items: [] as any[] };
    }

    if (String(active.type || "").toLowerCase() === "activeselection") {
      const items = typeof (active as any).getObjects === "function"
        ? (active as any).getObjects()
        : Array.isArray((active as any)._objects)
          ? (active as any)._objects
          : [];
      return { canvas, active, items: items.filter(Boolean) };
    }

    return { canvas, active, items: [active] };
  };

  const getInteractiveCanvasObjects = () => {
    const canvas = canvasRef.current;
    if (!canvas?.getObjects) return [] as any[];
    return canvas.getObjects().filter((obj: any) => obj && !isLiveEraserObject(obj));
  };

  const isObjectLocked = (obj: any) =>
    !!(obj && obj.lockMovementX && obj.lockMovementY && obj.lockScalingX && obj.lockScalingY && obj.lockRotation);

  const setObjectLocked = (obj: any, locked: boolean) => {
    if (!obj) return;
    const data = Object.assign({}, obj.data ?? {});
    if (locked) {
      // Salva controle original do mtr (rotação) em propriedade oculta para restauração
      try {
        const saved = getHiddenProperty(obj, "__moldaSavedMtrControl");
        if (!saved && obj.controls && obj.controls.mtr) {
          setHiddenProperty(obj, "__moldaSavedMtrControl", obj.controls.mtr);
        }
      } catch {}

      data[LOCK_SNAPSHOT_KEY] = {
        hasControls: obj.hasControls !== undefined ? obj.hasControls : true,
        hasBorders: obj.hasBorders !== undefined ? obj.hasBorders : true,
        hoverCursor: obj.hoverCursor ?? "move",
        moveCursor: obj.moveCursor ?? "move",
      };
      data.__moldaLocked = true;
      obj.lockMovementX = true;
      obj.lockMovementY = true;
      obj.lockScalingX = true;
      obj.lockScalingY = true;
      obj.lockRotation = true;
      obj.editable = false;
      // Exibe o gizmo de seleção mesmo bloqueado (controles/handles aparecerão, mas não terão efeito)
      obj.hasControls = true;
      obj.hasBorders = true; // mantém borda para visualização clara da seleção
      // Cursor normal ao passar, mas "not-allowed" durante tentativa de mover
      obj.hoverCursor = "default";
      obj.moveCursor = "not-allowed";

      // Substitui o handle de rotação (mtr) por um cadeado clicável que desbloqueia
      try {
        const fabric = fabricRef.current;
        if (fabric && obj.controls) {
          const Control = fabric.Control || (fabric as any).control?.Control;
          const orig = obj.controls.mtr;
          if (Control) {
            const sizeFrom = (o: any) => Number(o?.cornerSize || 24);
            const padlockRender = (
              ctx: CanvasRenderingContext2D,
              left: number,
              top: number,
              style: any,
              o: any
            ) => {
              // 1) Renderiza o handle padrão do Fabric (círculo/conexão) para manter o estilo do gizmo
              try {
                if (typeof orig?.render === "function") {
                  orig.render.call(orig, ctx, left, top, style, o);
                }
              } catch {}

              // 2) Desenha o ícone de cadeado por cima, usando as cores do gizmo
              const s = Math.max(18, sizeFrom(o));
              const strokeBase = style?.cornerStrokeColor || o?.cornerStrokeColor || "#111";
              const fillBase = style?.cornerColor || o?.cornerColor || "#fff";
              const parseColor = (c: string) => {
                // aceita #rgb/#rrggbb/rgba/ named; foco em hex para luminância
                const hex = c.startsWith('#') ? c.replace('#','') : null;
                if (hex) {
                  const full = hex.length === 3 ? hex.split('').map(ch=>ch+ch).join('') : hex;
                  const n = parseInt(full, 16);
                  return { r: (n>>16)&255, g: (n>>8)&255, b: n&255 };
                }
                // fallback: tenta rgba(r,g,b,a)
                const m = c.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
                if (m) { return { r: +m[1], g: +m[2], b: +m[3] }; }
                return { r: 255, g: 255, b: 255 };
              };
              const { r, g, b } = parseColor(fillBase);
              const lum = (0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255));
              const glyph = lum > 0.6 ? "#111" : "#fff"; // contraste com o botão
              const w = s * 0.46;
              const h = s * 0.36;
              const line = Math.max(2, s * 0.11);
              const shackleR = s * 0.2;

              ctx.save();
              ctx.translate(left, top);
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              // badge interno para reforçar contraste, menor que o círculo externo
              const innerR = s * 0.46;
              ctx.beginPath();
              ctx.arc(0, 0, innerR, 0, Math.PI * 2);
              ctx.fillStyle = fillBase;
              ctx.fill();

              ctx.strokeStyle = glyph;
              ctx.fillStyle = glyph;
              ctx.lineWidth = line;

              // alça do cadeado (arco)
              ctx.beginPath();
              ctx.arc(0, -h * 0.5, shackleR, Math.PI * 0.2, Math.PI * 0.8, false);
              ctx.stroke();

              // corpo do cadeado (retângulo arredondado)
              const bw = w;
              const bh = h;
              const rx = Math.min(bw, bh) * 0.18;
              const x = -bw / 2;
              const y = -bh / 2 + s * 0.04;
              ctx.beginPath();
              ctx.moveTo(x + rx, y);
              ctx.lineTo(x + bw - rx, y);
              ctx.quadraticCurveTo(x + bw, y, x + bw, y + rx);
              ctx.lineTo(x + bw, y + bh - rx);
              ctx.quadraticCurveTo(x + bw, y + bh, x + bw - rx, y + bh);
              ctx.lineTo(x + rx, y + bh);
              ctx.quadraticCurveTo(x, y + bh, x, y + bh - rx);
              ctx.lineTo(x, y + rx);
              ctx.quadraticCurveTo(x, y, x + rx, y);
              ctx.fill();
              // traço fino para destacar borda
              ctx.stroke();

              // pino central
              ctx.beginPath();
              ctx.arc(0, y + bh * 0.58, s * 0.06, 0, Math.PI * 2);
              ctx.fillStyle = lum > 0.6 ? strokeBase : "#111";
              ctx.fill();

              // halo suave para destacar em fundos complexos
              ctx.beginPath();
              ctx.arc(0, 0, innerR + Math.max(1, s*0.02), 0, Math.PI * 2);
              ctx.strokeStyle = glyph + '44'; // ~26% alpha
              ctx.lineWidth = Math.max(1, s*0.06);
              ctx.stroke();

              ctx.restore();
            };

            const mouseDownHandler = (_evt: any, transform: any) => {
              const target = transform?.target;
              if (target) {
                setObjectLocked(target, false);
                target.canvas?.setActiveObject?.(target);
                target.canvas?.requestRenderAll?.();
              }
              return true; // interrompe ação padrão
            };

            const padlockCtrl = new Control({
              x: orig?.x ?? 0,
              y: orig?.y ?? 0,
              offsetX: orig?.offsetX ?? 0,
              offsetY: orig?.offsetY ?? 0,
              positionHandler: orig?.positionHandler,
              sizeX: orig?.sizeX,
              sizeY: orig?.sizeY,
              cursorStyle: "pointer",
              render: padlockRender,
              mouseDownHandler,
              withConnection: orig?.withConnection ?? true,
            });
            obj.controls.mtr = padlockCtrl;
          }
        }
      } catch {}
    } else {
      const snapshot = data[LOCK_SNAPSHOT_KEY] ?? {};
      obj.lockMovementX = false;
      obj.lockMovementY = false;
      obj.lockScalingX = false;
      obj.lockScalingY = false;
      obj.lockRotation = false;
      obj.editable = true;
      obj.hasControls = snapshot.hasControls ?? true;
      obj.hasBorders = snapshot.hasBorders ?? true;
      obj.hoverCursor = snapshot.hoverCursor ?? "move";
      obj.moveCursor = snapshot.moveCursor ?? "move";
      delete data.__moldaLocked;
      delete data[LOCK_SNAPSHOT_KEY];

      // Restaura o controle original do mtr, se tivermos guardado
      try {
        const saved = getHiddenProperty(obj, "__moldaSavedMtrControl");
        if (saved && obj.controls) {
          obj.controls.mtr = saved;
        }
        setHiddenProperty(obj, "__moldaSavedMtrControl", undefined);
      } catch {}
    }
    obj.selectable = true;
    obj.evented = true;
    obj.data = data;
    obj.setCoords?.();
    obj.dirty = true;
  };

  const getSelectionInfo = (): SelectionInfo => {
    const { canvas, active, items } = getCanvasSelection();
    if (!canvas || !active) {
      return {
        hasSelection: false,
        count: 0,
        isGroup: false,
        isMulti: false,
        isTextSelection: false,
        isFullyLocked: false,
        canGroup: false,
        canBringForward: false,
        canSendBackward: false,
        canBringToFront: false,
        canSendToBack: false,
        hasClipboard: clipboardRef.current !== null,
      };
    }

    const selected = items.filter((obj: any) => obj && !isLiveEraserObject(obj));
    const effective = selected.length > 0 ? selected : [active];
    const interactive = getInteractiveCanvasObjects();
    const indices = effective
      .map((obj: any) => interactive.indexOf(obj))
      .filter((idx: number) => idx >= 0);
    const hasIndices = indices.length > 0;
    const maxIdx = hasIndices ? Math.max(...indices) : -1;
    const minIdx = hasIndices ? Math.min(...indices) : -1;

    const canBringForward = hasIndices && maxIdx < interactive.length - 1;
    const canSendBackward = hasIndices && minIdx > 0;
    const canBringToFront = canBringForward;
    const canSendToBack = canSendBackward;

    const typeLabel = String(active.type || "");
    const isTextSelection = typeLabel.toLowerCase().includes("text");
    const isGroup = typeLabel.toLowerCase() === "group";
    const isMulti = typeLabel.toLowerCase() === "activeselection" && effective.length > 1;
    const isFullyLocked = effective.length > 0 && effective.every(isObjectLocked);

    return {
      hasSelection: true,
      count: effective.length,
      isGroup,
      isMulti,
      isTextSelection,
      isFullyLocked,
      canGroup: typeLabel.toLowerCase() === "activeselection" && effective.length > 1,
      canBringForward,
      canSendBackward,
      canBringToFront,
      canSendToBack,
      hasClipboard: clipboardRef.current !== null,
    };
  };

  const copySelection = async (): Promise<boolean> => {
    const { active } = getCanvasSelection();
    if (!active || typeof active.clone !== "function") return false;

    return new Promise((resolve) => {
      try {
        active.clone(
          (cloned: any) => {
            if (!cloned) {
              resolve(false);
              return;
            }
            const left = typeof cloned.left === "number" ? cloned.left : typeof active.left === "number" ? active.left : 0;
            const top = typeof cloned.top === "number" ? cloned.top : typeof active.top === "number" ? active.top : 0;
            cloned.canvas = canvasRef.current;
            cloned.left = left;
            cloned.top = top;
            clipboardRef.current = {
              object: cloned,
              left,
              top,
            };
            resolve(true);
          },
          [
            "data",
            "selectable",
            "evented",
            "erasable",
            "clipPath",
          ]
        );
      } catch {
        resolve(false);
      }
    });
  };

  const pasteSelection = async (opts?: { offset?: number }): Promise<boolean> => {
    const clipboard = clipboardRef.current;
    const canvas = canvasRef.current;
    if (!clipboard || !canvas || !clipboard.object || typeof clipboard.object.clone !== "function") {
      return false;
    }

    const offset = Number.isFinite(opts?.offset) ? Number(opts?.offset) : 16;

    return new Promise((resolve) => {
      try {
        clipboard.object.clone((cloned: any) => {
          if (!cloned) {
            resolve(false);
            return;
          }

          const baseLeft = typeof clipboard.left === "number" ? clipboard.left : 0;
          const baseTop = typeof clipboard.top === "number" ? clipboard.top : 0;
          const nextLeft = baseLeft + offset;
          const nextTop = baseTop + offset;

          canvas.discardActiveObject?.();

          if (cloned.type === "activeSelection") {
            cloned.canvas = canvas;
            cloned.set?.({ left: nextLeft, top: nextTop });
            const list = typeof cloned.getObjects === "function"
              ? cloned.getObjects()
              : Array.isArray((cloned as any)._objects)
                ? (cloned as any)._objects
                : [];

            list.forEach((obj: any) => {
              if (!obj) return;
              obj.left = (typeof obj.left === "number" ? obj.left : 0) + offset;
              obj.top = (typeof obj.top === "number" ? obj.top : 0) + offset;
              obj.selectable = true;
              obj.evented = true;
              obj.erasable = obj.erasable !== false;
              obj.lockMovementX = false;
              obj.lockMovementY = false;
              obj.lockScalingX = false;
              obj.lockScalingY = false;
              obj.lockRotation = false;
              if (obj.data) {
                delete obj.data.__moldaLocked;
                delete obj.data[LOCK_SNAPSHOT_KEY];
              }
              canvas.add(obj);
            });

            if (fabricRef.current?.ActiveSelection && list.length > 0) {
              const activeSel = new fabricRef.current.ActiveSelection(list, { canvas });
              activeSel.set({ left: nextLeft, top: nextTop });
              activeSel.setCoords?.();
              canvas.setActiveObject(activeSel);
            }
          } else {
            cloned.set?.({ left: nextLeft, top: nextTop, evented: true, selectable: true });
            cloned.erasable = cloned.erasable !== false;
            canvas.add(cloned);
            canvas.setActiveObject(cloned);
          }

          clipboard.left = nextLeft;
          clipboard.top = nextTop;
          clipboard.object = cloned;
          canvas.requestRenderAll?.();
          emitHistory();
          resolve(true);
        });
      } catch {
        resolve(false);
      }
    });
  };

  const duplicateSelection = async (): Promise<boolean> => {
    const copied = await copySelection();
    if (!copied) return false;
    return pasteSelection({ offset: 24 });
  };

  const toggleLockSelection = (lockState?: boolean) => {
    const { canvas, active, items } = getCanvasSelection();
    if (!canvas || !active) return;

    const targets = items.filter((obj: any) => obj && !isLiveEraserObject(obj));
    if (targets.length === 0 && !isLiveEraserObject(active)) {
      targets.push(active);
    }

    if (targets.length === 0) return;

    const shouldLock = typeof lockState === "boolean" ? lockState : !targets.every(isObjectLocked);
  targets.forEach((obj: any) => setObjectLocked(obj, shouldLock));

    if (!isRestoringRef.current && !isLoadingRef.current) {
      historyRef.current?.push(shouldLock ? "lock" : "unlock");
      emitHistory();
    }

    canvas.requestRenderAll?.();
  };

  const reorderSelection = (
    method: "bringForward" | "sendBackwards" | "bringToFront" | "sendToBack"
  ) => {
    const { canvas, active, items } = getCanvasSelection();
    if (!canvas || !active) return;

    const targets = items.filter((obj: any) => obj && !isLiveEraserObject(obj));
    if (targets.length === 0 && !isLiveEraserObject(active)) {
      targets.push(active);
    }

    if (targets.length === 0) return;

    // Reordenação precisa baseada apenas em objetos interativos (ignora paths do apagador)
    const interactive = getInteractiveCanvasObjects();
    if (!Array.isArray(interactive) || interactive.length === 0) return;

    const selectedSet = new Set(targets);
    const mode: "forward" | "backward" | "front" | "back" =
      method === "bringForward"
        ? "forward"
        : method === "sendBackwards"
        ? "backward"
        : method === "bringToFront"
        ? "front"
        : "back";

    // Calcula nova ordem dos interativos
    const computeNewInteractiveOrder = (
      arr: any[],
      sel: Set<any>,
      kind: "forward" | "backward" | "front" | "back"
    ) => {
      const a = arr.slice();
      if (kind === "front" || kind === "back") {
        const kept: any[] = [];
        const picked: any[] = [];
        a.forEach((o) => (sel.has(o) ? picked.push(o) : kept.push(o)));
        return kind === "front" ? kept.concat(picked) : picked.concat(kept);
      }

      // one-step swap, preservando blocos selecionados
      if (kind === "forward") {
        let i = 0;
        while (i < a.length) {
          if (!sel.has(a[i])) {
            i++;
            continue;
          }
          // início de um bloco selecionado
          let s = i;
          let e = i;
          while (e + 1 < a.length && sel.has(a[e + 1])) e++;
          // se houver um vizinho à frente não selecionado, troca bloco com o vizinho
          if (e < a.length - 1 && !sel.has(a[e + 1])) {
            const neighbor = a[e + 1];
            // move neighbor para posição s, deslocando bloco +1
            a.splice(e + 1, 1);
            a.splice(s, 0, neighbor);
            // bloco agora inicia em s+1
            i = e + 2; // salta além do bloco que andou
          } else {
            i = e + 1;
          }
        }
        return a;
      }

      // backward
      let i = 0;
      while (i < a.length) {
        if (!sel.has(a[i])) {
          i++;
          continue;
        }
        // início de um bloco selecionado
        let s = i;
        let e = i;
        while (e + 1 < a.length && sel.has(a[e + 1])) e++;
        // se houver um vizinho atrás não selecionado, troca bloco com o vizinho
        if (s > 0 && !sel.has(a[s - 1])) {
          const neighbor = a[s - 1];
          // remove neighbor e recoloca após o bloco (posição e)
          a.splice(s - 1, 1);
          a.splice(e, 0, neighbor);
          // como deslocamos um para trás, manter varredura segura
          i = e + 1;
        } else {
          i = e + 1;
        }
      }
      return a;
    };

    const newInteractiveOrder = computeNewInteractiveOrder(interactive, selectedSet, mode);

    // Mescla a nova ordem interativa preservando âncoras não interativas
    const all = typeof canvas.getObjects === "function" ? canvas.getObjects() : [];
    const finalAll: any[] = [];
    let p = 0;
    for (let idx = 0; idx < all.length; idx++) {
      const o = all[idx];
      if (o && !isLiveEraserObject(o)) {
        finalAll.push(newInteractiveOrder[p++]);
      } else {
        finalAll.push(o);
      }
    }

    // Aplica a ordem final no canvas (primeiro via moveTo)
    finalAll.forEach((obj, idx) => {
      try {
        if (typeof (canvas as any).moveTo === "function") {
          (canvas as any).moveTo(obj, idx);
        } else if (typeof obj.moveTo === "function") {
          obj.moveTo(idx);
        }
      } catch {}
    });

    // Verifica se a ordem efetiva bate; se não, força reordenação por splice no array interno
    try {
      const current = typeof canvas.getObjects === "function" ? canvas.getObjects() : [];
      const mismatch =
        current.length !== finalAll.length || current.some((o: any, i: number) => o !== finalAll[i]);
      if (mismatch && Array.isArray((canvas as any)._objects)) {
        const backing = (canvas as any)._objects as any[];
        backing.splice(0, backing.length, ...finalAll);
      }
    } catch {}

    const typeLabel = String(active.type || "").toLowerCase();
    if (typeLabel === "activeselection" && fabricRef.current?.ActiveSelection) {
      canvas.discardActiveObject();
      const sel = new fabricRef.current.ActiveSelection(targets, { canvas });
      sel.setCoords?.();
      canvas.setActiveObject(sel);
    } else {
      canvas.setActiveObject(active);
    }

    // Força render completo para refletir z-order imediatamente
    if (typeof (canvas as any).renderAll === "function") {
      (canvas as any).renderAll();
    } else {
      canvas.requestRenderAll?.();
    }

    if (!isRestoringRef.current && !isLoadingRef.current) {
      historyRef.current?.push("arrange");
      emitHistory();
    }
  };

  const bringSelectionForward = () => reorderSelection("bringForward");
  const sendSelectionBackward = () => reorderSelection("sendBackwards");
  const bringSelectionToFront = () => reorderSelection("bringToFront");
  const sendSelectionToBack = () => reorderSelection("sendToBack");

  const groupSelection = () => {
    const { canvas, active } = getCanvasSelection();
    if (!canvas || !active) return;
    if (String(active.type || "").toLowerCase() !== "activeselection") return;
    if (typeof (active as any).toGroup !== "function") return;

    const group = (active as any).toGroup();
    if (!group) return;
    group.erasable = true;
    group.setCoords?.();
    canvas.setActiveObject(group);
    canvas.requestRenderAll?.();
    if (!isRestoringRef.current && !isLoadingRef.current) {
      historyRef.current?.push("group");
      emitHistory();
    }
  };

  const applyMatrixToObject = (target: any, matrix: number[] | null | undefined) => {
    const fabric = fabricRef.current;
    if (!fabric || !target || !matrix) return;
    const util = fabric.util || {};
    const decompose = typeof util.qrDecompose === "function" ? util.qrDecompose : null;
    if (!decompose) {
      target.set({
        left: matrix[4] ?? target.left ?? 0,
        top: matrix[5] ?? target.top ?? 0,
      });
      target.setCoords?.();
      return;
    }
    const options = decompose(matrix);
    const PointCtor = (fabric as any).Point || (fabric as any).Point2D;
    target.set({
      scaleX: options.scaleX,
      scaleY: options.scaleY,
      skewX: options.skewX,
      skewY: options.skewY,
      angle: options.angle,
    });
    if (PointCtor && typeof target.setPositionByOrigin === "function") {
      const center = new PointCtor(options.translateX, options.translateY);
      target.setPositionByOrigin(center, "center", "center");
    } else {
      target.set({ left: options.translateX, top: options.translateY });
    }
    target.setCoords?.();
  };

  const detachFallbackPath = (path: any) => {
    if (!path) return;
    const links = getHiddenProperty(path, "__moldaLiveEraserTargets");
    if (Array.isArray(links)) {
      links.forEach((entry: any) => {
        const target = entry?.target;
        const followers = getHiddenProperty(target, "__moldaLiveEraserFollowers");
        if (Array.isArray(followers)) {
          const filtered = followers.filter((info: any) => info?.path !== path);
          setHiddenProperty(target, "__moldaLiveEraserFollowers", filtered);
        }
      });
    }
    setHiddenProperty(path, "__moldaLiveEraserTargets", []);
    if (path.data) path.data.__liveEraserTargetsCount = 0;
  };

  const detachFallbackTarget = (target: any) => {
    if (!target) return;
    const followers = getHiddenProperty(target, "__moldaLiveEraserFollowers");
    if (!Array.isArray(followers) || followers.length === 0) {
      setHiddenProperty(target, "__moldaLiveEraserFollowers", []);
      return;
    }
    followers.slice().forEach((entry: any) => {
      const path = entry?.path;
      if (!path) return;
      detachFallbackPath(path);
      const canvas = path.canvas;
      if (canvas) {
        canvas.remove(path);
        canvas.requestRenderAll?.();
      }
    });
    setHiddenProperty(target, "__moldaLiveEraserFollowers", []);
  };

  const syncFallbackEraserFollowers = (target: any) => {
    if (!target) return;
    const followers = getHiddenProperty(target, "__moldaLiveEraserFollowers");
    if (!Array.isArray(followers) || followers.length === 0) return;
    const fabric = fabricRef.current;
    if (!fabric) return;
    const util = fabric.util || {};
    const multiply = typeof util.multiplyTransformMatrices === "function" ? util.multiplyTransformMatrices : null;
    const targetMatrix = typeof target.calcTransformMatrix === "function"
      ? target.calcTransformMatrix()
      : [1, 0, 0, 1, target.left || 0, target.top || 0];
    if (!multiply) return;
    followers.forEach((entry: any) => {
      const path = entry?.path;
      const relMatrix = entry?.relMatrix;
      if (!path || !relMatrix) return;
      const nextMatrix = multiply(targetMatrix, relMatrix);
      applyMatrixToObject(path, nextMatrix);
      path.dirty = true;
    });
    target.canvas?.requestRenderAll?.();
  };

  const registerFallbackEraserPath = (path: any) => {
    if (!path || !path.data || !path.data.__liveEraser) return;
    const fabric = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabric || !canvas) return;
    const util = fabric.util || {};
    const multiply = typeof util.multiplyTransformMatrices === "function" ? util.multiplyTransformMatrices : null;
    const invert = typeof util.invertTransform === "function" ? util.invertTransform : null;
    if (!multiply || !invert) return;

    const originX = path.originX;
    const originY = path.originY;
    const getCenter = typeof path.getCenterPoint === "function" ? path.getCenterPoint.bind(path) : null;
    if ((originX !== "center" || originY !== "center") && getCenter) {
      const center = getCenter();
      if (center) {
        path.set({ originX: "center", originY: "center" });
        if (typeof path.setPositionByOrigin === "function") {
          path.setPositionByOrigin(center, "center", "center");
        }
        path.setCoords?.();
      }
    }

    const pathMatrix = typeof path.calcTransformMatrix === "function"
      ? path.calcTransformMatrix()
      : [1, 0, 0, 1, path.left || 0, path.top || 0];

    const attachments: any[] = [];
    const objects = typeof canvas.getObjects === "function" ? canvas.getObjects() : [];
    objects.forEach((obj: any) => {
      if (!obj || obj === path) return;
      if (obj?.data && obj.data.__liveEraser) return;
      if (obj?.erasable === false) return;
      if (obj.excludeFromExport && obj.data && obj.data.__liveEraser) return;

      const canIntersect = typeof path.intersectsWithObject === "function" && typeof obj.intersectsWithObject === "function";
      let intersects = false;
      if (canIntersect) {
        try {
          intersects = path.intersectsWithObject(obj) || obj.intersectsWithObject(path);
        } catch {
          intersects = false;
        }
      }
      if (!intersects && typeof path.getBoundingRect === "function" && typeof obj.getBoundingRect === "function") {
        const pathRect = path.getBoundingRect(true, true);
        const objRect = obj.getBoundingRect(true, true);
        if (pathRect && objRect) {
          intersects =
            pathRect.left <= objRect.left + objRect.width &&
            pathRect.left + pathRect.width >= objRect.left &&
            pathRect.top <= objRect.top + objRect.height &&
            pathRect.top + pathRect.height >= objRect.top;
        }
      }
      if (!intersects) return;

      const targetMatrix = typeof obj.calcTransformMatrix === "function"
        ? obj.calcTransformMatrix()
        : [1, 0, 0, 1, obj.left || 0, obj.top || 0];
      const inv = invert(targetMatrix);
      if (!inv) return;
      const relMatrix = multiply(inv, pathMatrix);
      if (!relMatrix) return;

      attachments.push({ target: obj, relMatrix });
      let followers = getHiddenProperty(obj, "__moldaLiveEraserFollowers");
      if (!Array.isArray(followers)) {
        followers = [];
      }
      const exists = followers.some((entry: any) => entry?.path === path);
      if (!exists) {
        followers.push({ path, relMatrix });
      }
      setHiddenProperty(obj, "__moldaLiveEraserFollowers", followers);
    });

    setHiddenProperty(path, "__moldaLiveEraserTargets", attachments);
    if (path.data) path.data.__liveEraserTargetsCount = attachments.length;
    try {
      canvas.bringToFront(path);
    } catch {}
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
    const cached = __SprayBrushExCache.get(fabric);
    if (cached) return cached;
    const Base = fabric.SprayBrush || fabric.PencilBrush;
    class SprayBrushEx extends Base {
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
    __SprayBrushExCache.set(fabric, SprayBrushEx);
    return SprayBrushEx;
  };

  const ensureCalligraphyBrush = (fabric: any) => {
    const cached = __CalligraphyBrushCache.get(fabric);
    if (cached) return cached;
    const Base = fabric.PencilBrush;
    class CalligraphyBrush extends Base {
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
    __CalligraphyBrushCache.set(fabric, CalligraphyBrush);
    return CalligraphyBrush;
  };

  const ensureEraserBrush = (fabric: any) => {
    if (fabric.EraserBrush) {
      return fabric.EraserBrush;
    }

    const cached = __LiveEraserBrushCache.get(fabric);
    if (cached) return cached;

      const joinPath = fabric.util?.joinPath;
      const isTrivialPath = (pathData: any) => {
        if (!joinPath) return false;
        return joinPath(pathData) === "M 0 0 Q 0 0 0 0 L 0 0";
      };

      class LiveEraserBrush extends fabric.PencilBrush {
        private _livePath: any = null;
        private _hasFiredBeforeEvent = false;

        constructor(canvas: any) {
          super(canvas);
          this.color = "rgba(0,0,0,1)";
        }

        private ensureLivePath(finalize = false) {
          if (!this._points || this._points.length < 2) {
            return null;
          }

          const pathData = this.convertPointsToSVGPath(this._points);
          if (isTrivialPath(pathData)) {
            return null;
          }

          if (!this._livePath) {
            const path = this.createPath(pathData);
            path.globalCompositeOperation = "destination-out";
            path.stroke = "rgba(0,0,0,1)";
            path.fill = "";
            path.strokeWidth = this.width;
            path.strokeLineCap = "round";
            path.strokeLineJoin = "round";
            path.selectable = false;
            path.evented = false;
            path.objectCaching = false;
            path.hasBorders = false;
            path.hasControls = false;
            path.hoverCursor = "default";
            path.lockMovementX = true;
            path.lockMovementY = true;
            path.lockScalingX = true;
            path.lockScalingY = true;
            path.lockRotation = true;
            path.data = { __liveEraser: true };
            if (!this._hasFiredBeforeEvent) {
              this.canvas.fire("before:path:created", { path });
              this._hasFiredBeforeEvent = true;
            }
            this.canvas.add(path);
            this._livePath = path;
          } else {
            const target = this._livePath;
            if (typeof target._setPath === "function") {
              target._setPath(pathData, true);
            } else {
              target.path = pathData;
            }
            target.set({ strokeWidth: this.width });
            target.globalCompositeOperation = "destination-out";
            target.objectCaching = false;
            target.dirty = true;
            target.setCoords();
            target.selectable = false;
            target.evented = false;
            target.lockMovementX = true;
            target.lockMovementY = true;
            target.lockScalingX = true;
            target.lockScalingY = true;
            target.lockRotation = true;
          }

          this.canvas.requestRenderAll();
          if (finalize) {
            const finalPath = this._livePath;
            if (finalPath) {
              finalPath.selectable = false;
              finalPath.evented = false;
              finalPath.lockMovementX = true;
              finalPath.lockMovementY = true;
              finalPath.lockScalingX = true;
              finalPath.lockScalingY = true;
              finalPath.lockRotation = true;
              try {
                registerFallbackEraserPath(finalPath);
              } catch {}
            }
            this._livePath = null;
            this._hasFiredBeforeEvent = false;
            return finalPath;
          }
          return this._livePath;
        }

        onMouseDown(pointer: any, evt: any) {
          const { e } = evt;
          if (!this.canvas._isMainEvent(e)) return;
          this.drawStraightLine = !!this.straightLineKey && e[this.straightLineKey];
          this._reset();
          this._addPoint(pointer);
          if (this._livePath) {
            this.canvas.remove(this._livePath);
            this._livePath = null;
          }
          this._hasFiredBeforeEvent = false;
          this.canvas.clearContext(this.canvas.contextTop);
        }

        onMouseMove(pointer: any, evt: any) {
          const { e } = evt;
          if (!this.canvas._isMainEvent(e)) return;
          this.drawStraightLine = !!this.straightLineKey && e[this.straightLineKey];
          if (this.limitedToCanvasSize === true && this._isOutSideCanvas(pointer)) {
            return;
          }
          if (this._addPoint(pointer) && this._points.length > 1) {
            this.ensureLivePath(false);
          }
        }

        onMouseUp({ e }: any) {
          if (!this.canvas._isMainEvent(e)) {
            return true;
          }

          this.drawStraightLine = false;

          if (this.decimate) {
            this._points = this.decimatePoints(this._points, this.decimate);
          }

          const path = this.ensureLivePath(true);
          this.canvas.clearContext(this.canvas.contextTop);

          if (path) {
            path.setCoords();
            this._resetShadow();
            this.canvas.fire("path:created", { path });
          }

          this._reset();
          return false;
        }

        _render() {
          return;
        }
      }

      __LiveEraserBrushCache.set(fabric, LiveEraserBrush);
      return LiveEraserBrush;
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

    if (variant !== "eraser") {
      usingNativeEraserRef.current = false;
    }

    if (variant === "spray") {
      const Spray = ensureSprayBrush(fabric);
      const sb: any = new Spray(c);
      sb.width = Math.max(8, width * 1.6);
      sb.color = withAlpha(color, alpha);
      sb.opacity = 1;
      return sb;
    }

    if (variant === "eraser") {
      const Eraser = ensureEraserBrush(fabric);
      const eb: any = new Eraser(c);
      eb.width = Math.max(10, width * 2);
      usingNativeEraserRef.current = !!fabric.EraserBrush;
      if (!fabric.EraserBrush) {
        eb.strokeLineCap = "round";
        eb.strokeLineJoin = "round";
        eb.shadow = null;
      }
      return eb;
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
    let resetHostPosition: (() => void) | null = null;
    setCanvasReady(false);

    const init = async () => {
      try {
        console.debug("[Editor2D] init: starting fabric runtime load");
        const fabric = await loadFabricRuntime();
        if (disposed || !hostRef.current) return;

        fabricRef.current = fabric;

        const el = document.createElement("canvas");
        el.style.width = "100%";
        el.style.height = "100%";
  // Garantir captura de eventos do ponteiro
  el.style.pointerEvents = "auto";
        el.width = hostRef.current.clientWidth;
        el.height = hostRef.current.clientHeight;
  hostRef.current.style.pointerEvents = "auto";
  hostRef.current.appendChild(el);

        const c = new fabric.Canvas(el, {
          selection: true,
          preserveObjectStacking: true,
        });
        if (typeof (c as any).setBackgroundColor === "function") {
          (c as any).setBackgroundColor("transparent", () => c.renderAll());
        } else {
          try { (c as any).backgroundColor = "transparent"; } catch {}
          c.renderAll?.();
        }
        ensureInteractivity(c);

        try { c.calcOffset?.(); } catch {}

        canvasRef.current = c;
        domCanvasRef.current = el;
        setCanvasReady(true);
        try { hostRef.current?.setAttribute("data-editor2d", "fabric"); } catch {}

        console.debug("[Editor2D] init: fabric canvas ready", {
          size: { w: c.getWidth?.(), h: c.getHeight?.() },
        });

        try {
          (window as any).__editor2d_diag = () => ({
            tool,
            drawing: c.isDrawingMode,
            selection: c.selection,
            skipTargetFind: c.skipTargetFind,
            freeBrush: c.freeDrawingBrush ? c.freeDrawingBrush.constructor?.name : null,
            size: { w: c.getWidth?.(), h: c.getHeight?.() },
            upperPE: c.upperCanvasEl?.style?.pointerEvents,
            lowerPE: c.lowerCanvasEl?.style?.pointerEvents,
            hostPE: hostRef.current?.style?.pointerEvents,
            hasFabric: !!fabricRef.current,
          });
        } catch {}

        // Garante dimensionamento válido após o layout estabilizar
        try {
          requestAnimationFrame(() => {
            ensureCanvasSize();
            try { c.calcOffset?.(); } catch {}
            c.requestRenderAll?.();
          });
          setTimeout(() => {
            ensureCanvasSize();
            try { c.calcOffset?.(); } catch {}
            c.requestRenderAll?.();
          }, 0);
        } catch {}

        const hostEl = hostRef.current;
        if (hostEl) {
          const previousPosition = hostEl.style.position;
          if (!previousPosition) {
            hostEl.style.position = "relative";
            resetHostPosition = () => {
              if (hostRef.current) hostRef.current.style.position = "";
            };
          }

          const overlay = document.createElement("div");
          overlay.style.position = "absolute";
          overlay.style.top = "0";
          overlay.style.left = "0";
          overlay.style.width = "100%";
          overlay.style.height = "100%";
          overlay.style.pointerEvents = "none";
          overlay.style.display = "none";
          hostEl.appendChild(overlay);
          eraserOverlayRef.current = overlay;
        }

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

        const __onAdded = (evt: any) => {
          const target = evt?.target;
          if (target && !(target.data && target.data.__liveEraser) && !target?.eraser) {
            if (target.erasable === undefined) target.erasable = true;
          }
          if (!isRestoringRef.current && !isLoadingRef.current)
            historyRef.current?.push("add");
          emitHistory();
        };
        const __onRemoved = (evt: any) => {
          const target = evt?.target;
          if (target && target.data && target.data.__liveEraser) {
            detachFallbackPath(target);
          } else if (target) {
            const followers = getHiddenProperty(target, "__moldaLiveEraserFollowers");
            if (Array.isArray(followers) && followers.length > 0) {
              detachFallbackTarget(target);
            }
          }
          if (!isRestoringRef.current && !isLoadingRef.current && !(target && target.data && target.data.__liveEraser))
            historyRef.current?.push("remove");
          emitHistory();
        };
        const __onModified = (evt: any) => {
          const target = evt?.target;
          const isFallbackPath = !!(target && target.data && target.data.__liveEraser);
          if (target && !isFallbackPath) syncFallbackEraserFollowers(target);
          if (!isRestoringRef.current && !isLoadingRef.current && !isFallbackPath)
            historyRef.current?.push("modify");
          emitHistory();
        };
        const __onPath = (evt: any) => {
          const path = evt?.path;
          if (path && !(path.data && path.data.__liveEraser) && !path?.eraser) {
            path.erasable = true;
          }
          if (!isRestoringRef.current && !isLoadingRef.current)
            historyRef.current?.push("draw");
          emitHistory();
        };
        c.on("object:added", __onAdded);
        c.on("object:removed", __onRemoved);
        c.on("object:modified", __onModified);
        c.on("path:created", __onPath);

        const handleFollowerSync = (evt: any) => {
          const target = evt?.target;
          if (target) syncFallbackEraserFollowers(target);
        };
        c.on("object:moving", handleFollowerSync);
        // Evita que itens bloqueados se movam quando em seleção múltipla
        const preventLockedMoveOnActiveSelection = (evt: any) => {
          const target = evt?.target;
          if (!target) return;
          const ttype = String(target.type || "").toLowerCase();
          if (ttype !== "activeselection") return;

          const list = typeof target.getObjects === "function"
            ? target.getObjects()
            : Array.isArray((target as any)._objects)
              ? (target as any)._objects
              : [];
          if (!Array.isArray(list) || list.length === 0) return;

          const locked = list.filter((o: any) => o && isObjectLocked(o));
          if (locked.length === 0) return;

          const unlocked = list.filter((o: any) => o && !isObjectLocked(o));
          const canvas = target.canvas;
          const AS = fabricRef.current?.ActiveSelection;

          if (unlocked.length === 0) {
            // Tudo bloqueado: impede movimento da seleção inteira
            target.lockMovementX = true;
            target.lockMovementY = true;
            // opcional: nudga render
            canvas?.requestRenderAll?.();
            return;
          }

          // Recria seleção apenas com itens desbloqueados, para que apenas eles se movimentem
          try {
            canvas?.discardActiveObject();
            if (AS) {
              const nextSel = new AS(unlocked, { canvas });
              nextSel.setCoords?.();
              canvas?.setActiveObject(nextSel);
            } else {
              // fallback: seleciona o primeiro desbloqueado
              canvas?.setActiveObject(unlocked[0]);
            }
            canvas?.requestRenderAll?.();
          } catch {}
        };
        c.on("object:moving", preventLockedMoveOnActiveSelection);
        c.on("object:scaling", handleFollowerSync);
        c.on("object:rotating", handleFollowerSync);
        c.on("object:skewing", handleFollowerSync);

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

        const handleMouseMove = (e: MouseEvent) => {
          if (!eraserActiveRef.current || !eraserOverlayRef.current || !hostRef.current) return;
          const rect = hostRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const size = Math.max(10, strokeWidthRef.current * 2);

          let cursor = eraserOverlayRef.current.firstElementChild as HTMLDivElement | null;
          if (!cursor) {
            cursor = document.createElement("div");
            cursor.style.position = "absolute";
            cursor.style.border = "1px solid rgba(255,255,255,0.7)";
            cursor.style.borderRadius = "9999px";
            cursor.style.boxShadow = "0 0 6px rgba(0,0,0,0.35)";
            cursor.style.background = "rgba(255,255,255,0.1)";
            eraserOverlayRef.current.appendChild(cursor);
          }

          cursor.style.width = `${size}px`;
          cursor.style.height = `${size}px`;
          cursor.dataset.cx = String(x);
          cursor.dataset.cy = String(y);
          cursor.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
          eraserOverlayRef.current.style.display = "block";
        };

        const handleMouseLeave = () => {
          if (eraserOverlayRef.current) eraserOverlayRef.current.style.display = "none";
        };

        hostRef.current.addEventListener("mousemove", handleMouseMove);
        hostRef.current.addEventListener("mouseleave", handleMouseLeave);

        // Cleanup dos listeners extras
        const cleanupPublishers = () => {
          c.off("selection:created", onSel);
          c.off("selection:updated", onSel);
          c.off("selection:cleared", onSel);
          c.off("text:changed", notifyActiveTextStyle);
          window.removeEventListener("editor2d:requestActiveTextStyle", onRequest);
          hostRef.current?.removeEventListener("mousemove", handleMouseMove);
          hostRef.current?.removeEventListener("mouseleave", handleMouseLeave);
          if (eraserOverlayRef.current) {
            eraserOverlayRef.current.remove();
            eraserOverlayRef.current = null;
          }
          resetHostPosition?.();
          resetHostPosition = null;
        };
        // guarda para usar no unmount
        (cleanupRef as any).current = cleanupPublishers;

      } catch (err) {
        console.error("[Editor2D] init: fabric failed, falling back to DOM canvas", err);
        // Fallback 2D (sem fabric)
        if (disposed) return;
        if (eraserOverlayRef.current) {
          eraserOverlayRef.current.remove();
          eraserOverlayRef.current = null;
        }
        resetHostPosition?.();
        resetHostPosition = null;
        if (!hostRef.current) return;
        const el = document.createElement("canvas");
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.pointerEvents = "auto";
        el.width = hostRef.current.clientWidth;
        el.height = hostRef.current.clientHeight;
        hostRef.current.style.pointerEvents = "auto";
        hostRef.current.appendChild(el);
        domCanvasRef.current = el;
        canvasRef.current = null;
        setCanvasReady(true);
        try { hostRef.current?.setAttribute("data-editor2d", "fallback"); } catch {}
        console.warn("[Editor2D] init: DOM fallback ready", {
          size: { w: el.width, h: el.height },
        });
        try {
          requestAnimationFrame(() => ensureCanvasSize());
          setTimeout(() => ensureCanvasSize(), 0);
        } catch {}

        // mesmo sem fabric, ainda expõe getter vazio
        (window as any).__editor2d_getActiveTextStyle = () => ({});
      }
    };

    const cleanupRef = { current: (() => {}) as any };
    init();

    return () => {
      disposed = true;
      // cleanup
      const c = canvasRef.current;
      if (c) {
        c.off("object:added");
        c.off("object:removed");
        c.off("object:modified");
        c.off("path:created");
        c.off("object:moving");
        c.off("object:scaling");
        c.off("object:rotating");
        c.off("object:skewing");
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
      resetHostPosition?.();
      resetHostPosition = null;
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
        erasable: true,
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
    if (!isCanvasReady) return;
    const c = canvasRef.current;
    if (!c) {
      setHostCursor("default");
      return;
    }
    const fabric = fabricRef.current;
    if (!fabric) return;

    // reset handlers
    detachLineListeners(c);

    const logState = (extra?: any) => {
      try {
        console.debug("[Editor2D] tool", {
          tool,
          brushVariant,
          drawing: c.isDrawingMode,
          selection: c.selection,
          skipTargetFind: c.skipTargetFind,
          freeBrush: c.freeDrawingBrush ? c.freeDrawingBrush.constructor?.name : null,
          upperPE: c.upperCanvasEl?.style?.pointerEvents,
          lowerPE: c.lowerCanvasEl?.style?.pointerEvents,
          hostPE: hostRef.current?.style?.pointerEvents,
          ...(extra || {}),
        });
      } catch {}
    };

    // SELECT
    if (tool === "select") {
      c.isDrawingMode = false;
      c.selection = true;
      c.skipTargetFind = false;
      setObjectsSelectable(c, true);
      setHostCursor("default");
      c.discardActiveObject();
      c.renderAll();
      eraserActiveRef.current = false;
      if (eraserOverlayRef.current) eraserOverlayRef.current.style.display = "none";
      logState();
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
      eraserActiveRef.current = false;
      if (eraserOverlayRef.current) eraserOverlayRef.current.style.display = "none";
      logState();
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
      c.freeDrawingBrush = b || new (fabricRef.current?.PencilBrush || fabricRef.current.PencilBrush)(c);
      // Ajusta parâmetros caso o fallback tenha sido usado
      if (!b) {
        c.freeDrawingBrush.color = withAlpha(strokeColor, opacity);
        c.freeDrawingBrush.width = strokeWidth;
      }
      eraserActiveRef.current = brushVariant === "eraser";
      if (!eraserActiveRef.current && eraserOverlayRef.current) {
        eraserOverlayRef.current.style.display = "none";
      }
      if (brushVariant === "eraser" && b && typeof b === "object") {
        if (typeof (b as any).onMouseMove === "function") {
          const originalMove = (b as any).onMouseMove.bind(b);
          (b as any).onMouseMove = function (...args: any[]) {
            const result = originalMove(...args);
            this.canvas?.requestRenderAll?.();
            return result;
          };
        }
        if (typeof (b as any).drawPoint === "function") {
          const originalPoint = (b as any).drawPoint.bind(b);
          (b as any).drawPoint = function (...args: any[]) {
            const result = originalPoint(...args);
            this.canvas?.requestRenderAll?.();
            return result;
          };
        }
      }
  setHostCursor(brushVariant === "eraser" ? "none" : "crosshair");
      c.renderAll();
      logState();
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
            erasable: true,
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
      eraserActiveRef.current = false;
      if (eraserOverlayRef.current) eraserOverlayRef.current.style.display = "none";
      logState({ lineMode: "single" });
      return;
    }

    eraserActiveRef.current = false;
    if (eraserOverlayRef.current) eraserOverlayRef.current.style.display = "none";
  }, [tool, brushVariant, strokeColor, fillColor, strokeWidth, opacity, isCanvasReady]);

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
          erasable: true,
        });
      } else if (shape === "triangle") {
        obj = new fabric.Triangle({
          left: 120,
          top: 60,
          width: 140,
          height: 140,
          ...s,
          erasable: true,
        });
      } else if (shape === "ellipse") {
        obj = new fabric.Ellipse({ left: 100, top: 80, rx: 90, ry: 60, ...s, erasable: true });
      } else if (shape === "polygon") {
        const cx = 200, cy = 140, r = 70, sides = 6;
        const pts = Array.from({ length: sides }, (_, i) => {
          const a = (i / sides) * Math.PI * 2;
          return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
        });
        obj = new fabric.Polygon(pts, { ...s, left: cx - r, top: cy - r, erasable: true });
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
      const data = c.toJSON(["selectable", "evented", "erasable"]);
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
          try {
            c.getObjects()?.forEach((obj: any) => {
              if (obj?.data && obj.data.__liveEraser) {
                registerFallbackEraserPath(obj);
                return;
              }
              if (obj?.eraser) return;
              if (typeof obj === "object" && obj) {
                if (obj.erasable === undefined) obj.erasable = true;
              }
            });
          } catch {}
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
  const refresh = () => {
    const c = canvasRef.current;
    if (c) {
      try {
        ensureCanvasSize();
        c.calcOffset?.();
      } catch {}
      c.requestRenderAll?.();
      return;
    }
    const el = domCanvasRef.current;
    if (el) {
      // no fallback, apenas força um reflow visual (opcional)
      try { void el.getBoundingClientRect(); } catch {}
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (c) {
      try {
        c.getObjects()?.forEach((obj: any) => {
          if (obj?.data && obj.data.__liveEraser) {
            detachFallbackPath(obj);
          } else {
            const followers = getHiddenProperty(obj, "__moldaLiveEraserFollowers");
            if (Array.isArray(followers) && followers.length > 0) {
              detachFallbackTarget(obj);
            }
          }
        });
      } catch {}
      c.clear();
      // mantém transparente para seguir o “glass” do container
      if (typeof (c as any).setBackgroundColor === "function") {
        (c as any).setBackgroundColor("transparent", () => c.renderAll());
      } else {
        try { (c as any).backgroundColor = "transparent"; } catch {}
        c.renderAll?.();
      }
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
      erasable: true,
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

  const listUsedFonts = (): string[] => {
    const c: any = canvasRef.current as any;
    if (!c?.getObjects) return [];
    const found = new Set<string>();

    const pushFont = (value: unknown) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) found.add(trimmed);
      }
    };

    const collectFromStyles = (styles: any) => {
      if (!styles || typeof styles !== "object") return;
      Object.values(styles).forEach((line: any) => {
        if (!line || typeof line !== "object") return;
        Object.values(line).forEach((style: any) => {
          if (style && typeof style === "object") {
            pushFont((style as any).fontFamily);
          }
        });
      });
    };

    try {
      const objects = c.getObjects();
      objects?.forEach((obj: any) => {
        if (!obj) return;
        const type = String(obj.type || "").toLowerCase();
        if (!type.includes("text")) return;
        pushFont(obj.fontFamily);
        collectFromStyles(obj.styles);
      });
    } catch {}

    return Array.from(found);
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

    if (nextPatch.fontFamily) {
      try {
        window.dispatchEvent(
          new CustomEvent("editor2d:fontUsed", { detail: { fontFamily: nextPatch.fontFamily } })
        );
      } catch {}
    }

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
    refresh,
    addShape,
    addImage,
    toJSON,
    loadFromJSON,
    deleteSelection,
    copySelection,
    pasteSelection,
    duplicateSelection,
    toggleLockSelection,
    bringSelectionForward,
    sendSelectionBackward,
    bringSelectionToFront,
    sendSelectionToBack,
    groupSelection,
    getSelectionInfo,
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
  listUsedFonts,
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
