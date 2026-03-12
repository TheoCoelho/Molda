// src/components/FloatingEditorToolbar.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { GradientFill, GradientStop } from "./Editor2D";
import "./FloatingEditorToolbar.custom.css";
import {
  Droplet,
  Trash2,
  SlidersHorizontal,
  Undo2,
  Redo2,
  MousePointer2,
  Pipette,
  Circle,
  Minus,
  Plus,
  Eye,
} from "lucide-react";
type Props = {
  // Undo/Redo (ligação com Editor2D)
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;

  isTrashMode: boolean;
  setTrashMode: (v: boolean) => void;

  mode?: "2D" | "3D";

  strokeColor: string;
  setStrokeColor: (c: string) => void;

  stampColor?: string;
  setStampColor?: (c: string) => void;

  stampDensity?: number;
  setStampDensity?: (n: number) => void;

  strokeWidth: number;
  setStrokeWidth: (n: number) => void;

  opacity: number;
  setOpacity: (n: number) => void;

  tool: "select" | "brush" | "line" | "curve" | "text" | "stamp";
  setTool: (t: "select" | "brush" | "line" | "curve" | "text" | "stamp") => void;

  /** Tipo de seleção atual (para determinar se há forma selecionada) */
  selectionKind?: "none" | "text" | "image" | "other";

  /** Handle imperativo do Editor2D (opcional, usado para delete e histórico) */
  editor2DRef?: {
    deleteSelection?: () => void;
    historyCapture?: () => void;
  } | null;

  /** Callback para aplicar degradê no objeto selecionado */
  onApplyGradient?: (gradient: GradientFill) => void;
};

/** ===== Utils ===== */
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(R)}${toHex(G)}${toHex(B)}`.toUpperCase();
}
function hexToHsv(hex: string): [number, number, number] | null {
  const m = /^#([0-9A-F]{6})$/i.exec(hex);
  if (!m) return null;
  const i = parseInt(m[1], 16);
  const r = ((i >> 16) & 255) / 255;
  const g = ((i >> 8) & 255) / 255;
  const b = (i & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

/** Paleta base */
const DEFAULT_COLORS = [
  "#FF3B30", "#FF2D55", "#FF9500", "#FFCC00",
  "#34C759", "#30D158", "#5AC8FA", "#007AFF",
  "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F",
  "#8E8E93", "#AEAEB2", "#C7C7CC", "#D1D1D6",
  "#E5E5EA", "#F2F2F7", "#000000", "#FFFFFF",
];

/** ===== Componente ===== */
export default function FloatingEditorToolbar({
  mode = "2D",
  strokeColor,
  setStrokeColor,
  stampColor = "#000000",
  setStampColor,
  stampDensity = 50,
  setStampDensity,
  strokeWidth,
  setStrokeWidth,
  opacity,
  setOpacity,
  tool,
  setTool,
  isTrashMode,
  setTrashMode,
  selectionKind = "none",
  editor2DRef,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onApplyGradient,
}: Props) {
  // refs e medidas
  const barRef = useRef<HTMLDivElement>(null);
  const dropWrapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // redução de efeitos (perf)
  const [reduceFx, setReduceFx] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceFx(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceFx(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // HSV estado
  const [h, setH] = useState<number>(0);
  const [s, setS] = useState<number>(1);
  const [v, setV] = useState<number>(1);
  const activeColor = tool === "stamp" ? stampColor : strokeColor;
  const setActiveColor = (hex: string) => {
    if (tool === "stamp") {
      setStampColor?.(hex);
      return;
    }
    setStrokeColor(hex);
  };

  useEffect(() => {
    const hsv = hexToHsv(activeColor);
    if (hsv) {
      setH(hsv[0]); setS(hsv[1]); setV(hsv[2]);
    }
  }, [activeColor]);
  const currentHex = useMemo(() => hsvToHex(h, s, v), [h, s, v]);
  const [hexInput, setHexInput] = useState<string>(currentHex);
  useEffect(() => setHexInput(currentHex), [currentHex]);

  // Painel/hover
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [showSwatchBar, setShowSwatchBar] = useState(false);
  const swatchBarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** ====== Modo do painel: "solid" ou "gradient" ====== */
  const [colorMode, setColorMode] = useState<"solid" | "gradient">("solid");

  /** ====== Estado do Degradê ====== */
  const [gradStops, setGradStops] = useState<GradientStop[]>([
    { offset: 0, color: "#000000" },
    { offset: 1, color: "#FFFFFF" },
  ]);
  const [gradAngle, setGradAngle] = useState<number>(0);
  const [selectedStopIdx, setSelectedStopIdx] = useState<number>(0);
  const [stopDragging, setStopDragging] = useState(false);
  const gradBarRef = useRef<HTMLDivElement>(null);
  const gradApplyingRef = useRef(false);

  // aplica cor em tempo real ao arrastar (com rAF)
  const [svDragging, setSvDragging] = useState(false);
  const [hueDragging, setHueDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!(svDragging || hueDragging)) return;
    if (colorMode !== 'solid') return; // não interferir com o modo degradê
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setActiveColor(hsvToHex(h, s, v));
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [h, s, v, svDragging, hueDragging]);

  // Cores recomendadas (dinâmicas) + persistência
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("floatingToolbar.recents");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.every((c: any) => typeof c === "string" && /^#([0-9A-F]{6})$/i.test(c))) {
          return Array.from(new Set(arr.map((c: string) => c.toUpperCase())));
        }
      }
    } catch {}
    return ["#1677FF", ...DEFAULT_COLORS];
  });
  useEffect(() => {
    try {
      localStorage.setItem("floatingToolbar.recents", JSON.stringify(recents));
    } catch {}
  }, [recents]);

  // Layout da faixa (primeiro círculo “acima” da gota e cresce à direita)
  const SWATCH_SIZE = 28;
  const GAP = 8;
  const [barWidth, setBarWidth] = useState(0);
  const [dropletLeft, setDropletLeft] = useState(0);
  const [swatchWidth, setSwatchWidth] = useState(0);
  const [maxSwatches, setMaxSwatches] = useState(8);
  useEffect(() => {
    const measure = () => {
      if (!barRef.current) return;
      const barRect = barRef.current.getBoundingClientRect();
      setBarWidth(barRect.width);
      const left = dropWrapRef.current
        ? dropWrapRef.current.getBoundingClientRect().left - barRect.left
        : 0;
      setDropletLeft(left);
      const sw = Math.max(0, barRect.width - left);
      setSwatchWidth(sw);
      const internalPadding = 24;
      const available = Math.max(0, sw - internalPadding);
      const n = Math.max(6, Math.floor(available / (SWATCH_SIZE + GAP)));
      setMaxSwatches(n);
    };
    const ro = new ResizeObserver(measure);
    if (barRef.current) ro.observe(barRef.current);
    if (dropWrapRef.current) ro.observe(dropWrapRef.current);
    measure();
    return () => ro.disconnect();
  }, []);

  // paleta preenchendo a largura calculada
  const displayPalette = useMemo(() => {
    const unique = Array.from(new Set(recents.map((c) => c.toUpperCase())));
    const filled = [...unique];
    let i = 0;
    while (filled.length < maxSwatches) {
      filled.push(DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
      i++;
    }
    return filled.slice(0, maxSwatches);
  }, [recents, maxSwatches]);

  // helpers
  const applyPickedColor = (hex: string) => {
    const hsv = hexToHsv(hex);
    if (hsv) {
      setH(hsv[0]); setS(hsv[1]); setV(hsv[2]);
      setRecents((prev) => {
        const noDup = prev.filter((c) => c.toUpperCase() !== hex.toUpperCase());
        return [hex.toUpperCase(), ...noDup].slice(0, 64);
      });
      setActiveColor(hex.toUpperCase());
      // Para ferramentas de desenho, trocar cor é um gesto -> registra histórico.
      // Para stamp, a cor só afeta os próximos stamps (não o canvas atual).
      if (tool !== "stamp") editor2DRef?.historyCapture?.();
    }
  };

  // interações no painel
  const onSvPointer = (e: React.PointerEvent) => {
    const rect = svRef.current?.getBoundingClientRect(); if (!rect) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSvDragging(true);
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    setS(x); setV(1 - y);
  };
  const onHuePointer = (e: React.PointerEvent) => {
    const rect = hueRef.current?.getBoundingClientRect(); if (!rect) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHueDragging(true);
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setH(x * 360);
  };
  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim().toUpperCase();
    setHexInput(val);
    if (/^#([0-9A-F]{6})$/.test(val)) {
      applyPickedColor(val);
      // Registro final garantido em alterações por HEX
      if (tool !== "stamp") editor2DRef?.historyCapture?.();
    }
  };

  // Esc fecha tudo
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setIsColorPanelOpen(false);
        setShowSwatchBar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ====== Gradient helpers ======
  function interpolateHex(hex1: string, hex2: string, t: number): string {
    const h1 = hexToHsv(hex1) || [0, 0, 0];
    const h2 = hexToHsv(hex2) || [0, 0, 0];
    return hsvToHex(
      h1[0] + (h2[0] - h1[0]) * t,
      h1[1] + (h2[1] - h1[1]) * t,
      h1[2] + (h2[2] - h1[2]) * t,
    );
  }

  const applyGradient = useCallback((stops: GradientStop[], angle: number) => {
    gradApplyingRef.current = true;
    const gradFill: GradientFill = {
      type: 'gradient',
      gradientType: 'linear',
      angle,
      colorStops: stops,
    };
    onApplyGradient?.(gradFill);
    requestAnimationFrame(() => { gradApplyingRef.current = false; });
  }, [onApplyGradient]);

  const onStopBarPointer = useCallback((e: React.PointerEvent, idx: number) => {
    const bar = gradBarRef.current;
    if (!bar) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setStopDragging(true);
    setSelectedStopIdx(idx);
    const rect = bar.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setGradStops(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], offset: Math.round(x * 100) / 100 };
      return next;
    });
  }, []);

  const onStopBarMove = useCallback((e: React.PointerEvent, idx: number) => {
    if (!stopDragging) return;
    const bar = gradBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setGradStops(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], offset: Math.round(x * 100) / 100 };
      return next;
    });
  }, [stopDragging]);

  // Aplica em tempo real
  const gradRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (colorMode !== 'gradient') return;
    if (gradRafRef.current) cancelAnimationFrame(gradRafRef.current);
    gradRafRef.current = requestAnimationFrame(() => {
      applyGradient(gradStops, gradAngle);
    });
    return () => {
      if (gradRafRef.current) cancelAnimationFrame(gradRafRef.current);
      gradRafRef.current = null;
    };
  }, [gradStops, gradAngle, colorMode]);

  const gradientCSS = useMemo(() => {
    const sorted = [...gradStops].sort((a, b) => a.offset - b.offset);
    const stopsStr = sorted.map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
    return `linear-gradient(${gradAngle}deg, ${stopsStr})`;
  }, [gradStops, gradAngle]);

  const selectedStop = gradStops[selectedStopIdx] || gradStops[0];
  const selectedStopHSV = useMemo(() => hexToHsv(selectedStop?.color || '#000000') || [0, 0, 0], [selectedStop?.color]);

  const updateSelectedStopColor = useCallback((hex: string) => {
    setGradStops(prev => {
      const next = [...prev];
      if (next[selectedStopIdx]) {
        next[selectedStopIdx] = { ...next[selectedStopIdx], color: hex.toUpperCase() };
      }
      return next;
    });
  }, [selectedStopIdx]);

  const addGradStop = useCallback(() => {
    setGradStops(prev => {
      if (prev.length >= 8) return prev;
      const sorted = [...prev].sort((a, b) => a.offset - b.offset);
      let maxGap = 0, gapIdx = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].offset - sorted[i].offset;
        if (gap > maxGap) { maxGap = gap; gapIdx = i; }
      }
      const newOffset = (sorted[gapIdx].offset + sorted[gapIdx + 1].offset) / 2;
      const c1 = sorted[gapIdx].color;
      const c2 = sorted[gapIdx + 1].color;
      const midColor = interpolateHex(c1, c2, 0.5);
      const newStops = [...prev, { offset: Math.round(newOffset * 100) / 100, color: midColor }];
      setSelectedStopIdx(newStops.length - 1);
      return newStops;
    });
  }, []);

  const removeGradStop = useCallback((idx: number) => {
    setGradStops(prev => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setSelectedStopIdx(si => Math.min(si, next.length - 1));
      return next;
    });
  }, []);

  return (
    <div className="relative z-20 inline-block select-none">
      <div className="group relative">
        {/* ====== TOOLBAR ====== */}
        <div
          ref={barRef}
          className="flex items-center gap-2 p-2"
        >
          {/* 1) Gota + paleta */}
          <div ref={dropWrapRef} className="relative">
            {/* wrapper hover controla a faixa */}
            <div
              onMouseEnter={() => {
                if (!isColorPanelOpen) {
                  if (swatchBarTimeout.current) clearTimeout(swatchBarTimeout.current);
                  setShowSwatchBar(true);
                }
              }}
              onMouseLeave={() => {
                if (!isColorPanelOpen) {
                  if (swatchBarTimeout.current) clearTimeout(swatchBarTimeout.current);
                  swatchBarTimeout.current = setTimeout(() => setShowSwatchBar(false), 90);
                }
              }}
              className="relative"
            >
              {/* Botão da gota */}
              <button
                type="button"
                title="Seleção de cores"
                aria-label="Abrir seleção de cores"
                className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
                onClick={() => { setIsColorPanelOpen((v) => !v); setShowSwatchBar(false); }}
              >
                <Droplet className="h-4 w-4" />
              </button>

              {/* ===== FAIXA DE CORES RECOMENDADAS (ACIMA) ===== */}
              {showSwatchBar && !isColorPanelOpen && (
                <div
                  className="absolute bottom-full mb-2 z-30"
                  style={{ left: dropletLeft, width: swatchWidth }}
                >
                  <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 p-2 shadow-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {displayPalette.map((c) => (
                        <button
                          key={c}
                          className="h-7 w-7 shrink-0 rounded-full border border-black/10 dark:border-white/10 shadow-sm"
                          style={{ backgroundColor: c }}
                          onClick={() => applyPickedColor(c)}
                          aria-label={`Usar cor ${c}`}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ===== PAINEL DE COR (ACIMA) ===== */}
            {isColorPanelOpen && (
              <div className="absolute left-0 bottom-full mb-3 z-30">
                <div className="rounded-2xl p-3 w-[min(320px,95vw)] bg-white/90 dark:bg-neutral-900/95 border border-black/10 dark:border-white/10">

                  {/* ===== Tabs Sólido / Degradê ===== */}
                  <div className="flex mb-3 rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
                    <button
                      type="button"
                      className={[
                        "flex-1 py-1.5 text-xs font-medium transition-colors",
                        colorMode === 'solid'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5',
                      ].join(' ')}
                      onClick={() => {
                        setColorMode('solid');
                        setActiveColor(hsvToHex(h, s, v));
                        editor2DRef?.historyCapture?.();
                      }}
                    >
                      Sólido
                    </button>
                    <button
                      type="button"
                      className={[
                        "flex-1 py-1.5 text-xs font-medium transition-colors",
                        colorMode === 'gradient'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5',
                      ].join(' ')}
                      onClick={() => {
                        setColorMode('gradient');
                        applyGradient(gradStops, gradAngle);
                        editor2DRef?.historyCapture?.();
                      }}
                    >
                      Degradê
                    </button>
                  </div>

                  {colorMode === 'solid' ? (
                    <>
                      {/* S/V */}
                      <div
                        ref={svRef}
                        className="relative h-[160px] rounded-xl overflow-hidden cursor-crosshair"
                        style={{ backgroundColor: `hsl(${h},100%,50%)` }}
                        onPointerDown={onSvPointer}
                        onPointerMove={(e) => svDragging && onSvPointer(e)}
                        onPointerUp={() => { setSvDragging(false); editor2DRef?.historyCapture?.(); }}
                        onPointerLeave={() => setSvDragging(false)}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff,transparent)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,#000,transparent)]" />
                        <div
                          className="absolute h-4 w-4 rounded-full border-2 border-white shadow"
                          style={{
                            left: `${s * 100}%`,
                            top: `${(1 - v) * 100}%`,
                            transform: "translate(-50%, -50%)",
                            background: currentHex,
                          }}
                        />
                      </div>

                      {/* Hue */}
                      <div
                        ref={hueRef}
                        className="mt-3 h-4 rounded-full cursor-pointer relative"
                        style={{
                          background:
                            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                        }}
                        onPointerDown={(e) => {
                          if (e.target === e.currentTarget) {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            setH(x * 360);
                            setActiveColor(hsvToHex(x * 360, s, v));
                            editor2DRef?.historyCapture?.();
                          }
                        }}
                      >
                        <div
                          className="absolute top-1/2 h-4 w-4 rounded-full border-2 border-white shadow cursor-ew-resize"
                          style={{
                            left: `${(h / 360) * 100}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            setHueDragging(true);
                            const rect = hueRef.current!.getBoundingClientRect();
                            const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            setH(x * 360);
                          }}
                          onPointerMove={(e) => {
                            if (!hueDragging) return;
                            const rect = hueRef.current!.getBoundingClientRect();
                            const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            setH(x * 360);
                          }}
                          onPointerUp={() => { setHueDragging(false); editor2DRef?.historyCapture?.(); }}
                        />
                      </div>

                      {/* Linha: HEX + conta-gotas (visual) */}
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          aria-label="Cor em HEX"
                          value={hexInput}
                          onChange={onHexChange}
                          onBlur={() => editor2DRef?.historyCapture?.()}
                          maxLength={7}
                          className="w-28 px-2 py-1 rounded border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 text-sm"
                          placeholder="#000000"
                        />
                        <div className="flex-1" />
                        <button
                          type="button"
                          className="h-9 w-9 rounded-xl border bg-white/70 dark:bg-neutral-800/70 border-black/10 dark:border-white/10 grid place-items-center"
                          title="Conta-gotas do sistema (visual)"
                        >
                          <Pipette className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* ===== MODO DEGRADÊ ===== */}

                      {/* Barra de preview do degradê */}
                      <div
                        ref={gradBarRef}
                        className="relative h-8 rounded-lg overflow-visible cursor-pointer"
                        style={{ background: gradientCSS }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target === gradBarRef.current) {
                            const rect = gradBarRef.current!.getBoundingClientRect();
                            const offset = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            const sorted = [...gradStops].sort((a, b) => a.offset - b.offset);
                            let leftC = sorted[0]?.color || '#000000';
                            let rightC = sorted[sorted.length - 1]?.color || '#FFFFFF';
                            for (let i = 0; i < sorted.length - 1; i++) {
                              if (offset >= sorted[i].offset && offset <= sorted[i + 1].offset) {
                                leftC = sorted[i].color;
                                rightC = sorted[i + 1].color;
                                break;
                              }
                            }
                            const newColor = interpolateHex(leftC, rightC, 0.5);
                            setGradStops(prev => {
                              if (prev.length >= 8) return prev;
                              const next = [...prev, { offset: Math.round(offset * 100) / 100, color: newColor }];
                              setSelectedStopIdx(next.length - 1);
                              return next;
                            });
                          }
                        }}
                      >
                        {gradStops.map((stop, idx) => (
                          <div
                            key={idx}
                            className={[
                              "absolute top-1/2 h-5 w-5 rounded-full border-2 shadow cursor-grab",
                              "transform -translate-x-1/2 -translate-y-1/2",
                              idx === selectedStopIdx
                                ? 'border-primary ring-2 ring-primary/30 z-10'
                                : 'border-white z-[5]',
                            ].join(' ')}
                            style={{
                              left: `${stop.offset * 100}%`,
                              background: stop.color,
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              onStopBarPointer(e, idx);
                            }}
                            onPointerMove={(e) => onStopBarMove(e, idx)}
                            onPointerUp={() => {
                              setStopDragging(false);
                              editor2DRef?.historyCapture?.();
                            }}
                            onPointerLeave={() => { if (stopDragging) setStopDragging(false); }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStopIdx(idx);
                            }}
                          />
                        ))}
                      </div>

                      {/* Ações: Adicionar / Remover stop */}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="h-7 px-2 rounded border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-800/70 text-xs flex items-center gap-1 hover:bg-black/5 dark:hover:bg-white/5 transition"
                          onClick={addGradStop}
                          disabled={gradStops.length >= 8}
                          title="Adicionar cor"
                        >
                          <Plus className="h-3 w-3" /> Cor
                        </button>
                        <button
                          type="button"
                          className="h-7 px-2 rounded border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-800/70 text-xs flex items-center gap-1 hover:bg-black/5 dark:hover:bg-white/5 transition disabled:opacity-40"
                          onClick={() => removeGradStop(selectedStopIdx)}
                          disabled={gradStops.length <= 2}
                          title="Remover cor selecionada"
                        >
                          <Minus className="h-3 w-3" /> Remover
                        </button>
                        <div className="flex-1" />
                        <span className="text-[10px] text-muted-foreground">
                          Stop {selectedStopIdx + 1}/{gradStops.length}
                        </span>
                      </div>

                      {/* HSV do stop selecionado */}
                      <div
                        className="relative h-[120px] mt-3 rounded-xl overflow-hidden cursor-crosshair"
                        style={{ backgroundColor: `hsl(${selectedStopHSV[0]},100%,50%)` }}
                        onPointerDown={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setSvDragging(true);
                          const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                          const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
                          updateSelectedStopColor(hsvToHex(selectedStopHSV[0], x, 1 - y));
                        }}
                        onPointerMove={(e) => {
                          if (!svDragging) return;
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                          const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
                          updateSelectedStopColor(hsvToHex(selectedStopHSV[0], x, 1 - y));
                        }}
                        onPointerUp={() => { setSvDragging(false); editor2DRef?.historyCapture?.(); }}
                        onPointerLeave={() => setSvDragging(false)}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff,transparent)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,#000,transparent)]" />
                        <div
                          className="absolute h-3.5 w-3.5 rounded-full border-2 border-white shadow"
                          style={{
                            left: `${selectedStopHSV[1] * 100}%`,
                            top: `${(1 - selectedStopHSV[2]) * 100}%`,
                            transform: "translate(-50%, -50%)",
                            background: selectedStop?.color || '#000',
                          }}
                        />
                      </div>

                      {/* Hue para o stop selecionado */}
                      <div
                        className="mt-2 h-3.5 rounded-full cursor-pointer relative"
                        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
                        onPointerDown={(e) => {
                          if (e.target === e.currentTarget) {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            updateSelectedStopColor(hsvToHex(x * 360, selectedStopHSV[1], selectedStopHSV[2]));
                            editor2DRef?.historyCapture?.();
                          }
                        }}
                      >
                        <div
                          className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-white shadow cursor-ew-resize"
                          style={{
                            left: `${(selectedStopHSV[0] / 360) * 100}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            setHueDragging(true);
                            const bar = (e.currentTarget.parentElement as HTMLElement);
                            const rect = bar.getBoundingClientRect();
                            const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            updateSelectedStopColor(hsvToHex(x * 360, selectedStopHSV[1], selectedStopHSV[2]));
                          }}
                          onPointerMove={(e) => {
                            if (!hueDragging) return;
                            const bar = (e.currentTarget.parentElement as HTMLElement);
                            const rect = bar.getBoundingClientRect();
                            const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                            updateSelectedStopColor(hsvToHex(x * 360, selectedStopHSV[1], selectedStopHSV[2]));
                          }}
                          onPointerUp={() => { setHueDragging(false); editor2DRef?.historyCapture?.(); }}
                        />
                      </div>

                      {/* Ângulo */}
                      <div className="mt-3 flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Ângulo</span>
                        {[0, 45, 90, 135, 180].map(a => (
                          <button
                            key={a}
                            type="button"
                            className={[
                              "h-6 min-w-6 px-1 rounded text-[10px] border transition",
                              gradAngle === a
                                ? 'bg-primary/15 border-primary/30 text-primary font-medium'
                                : 'border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-800/70 hover:bg-black/5 dark:hover:bg-white/5',
                            ].join(' ')}
                            onClick={() => {
                              setGradAngle(a);
                              editor2DRef?.historyCapture?.();
                            }}
                          >
                            {a}°
                          </button>
                        ))}
                        <input
                          type="number"
                          min={0}
                          max={360}
                          value={gradAngle}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setGradAngle(((val % 360) + 360) % 360);
                          }}
                          onBlur={() => editor2DRef?.historyCapture?.()}
                          className="w-12 h-6 text-center text-[10px] rounded border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70"
                          title="Ângulo personalizado"
                        />
                      </div>

                      {/* HEX do stop selecionado */}
                      <div className="mt-2 flex items-center gap-2">
                        <div
                          className="h-6 w-6 rounded-md border border-black/10 dark:border-white/10"
                          style={{ background: selectedStop?.color || '#000' }}
                        />
                        <input
                          aria-label="Cor do stop em HEX"
                          value={selectedStop?.color || '#000000'}
                          onChange={(e) => {
                            const val = e.target.value.trim().toUpperCase();
                            if (/^#([0-9A-F]{6})$/.test(val)) {
                              updateSelectedStopColor(val);
                            }
                          }}
                          onBlur={() => editor2DRef?.historyCapture?.()}
                          maxLength={7}
                          className="w-24 px-2 py-0.5 rounded border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 text-xs"
                          placeholder="#000000"
                        />
                      </div>
                    </>
                  )}

                </div>
              </div>
            )}
          </div>

          {/* 2) Lixeira */}
          <button
            type="button"
            aria-label={isTrashMode ? "Desativar modo lixeira" : "Excluir objeto selecionado ou ativar modo lixeira"}
            className={`h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 ${isTrashMode ? "bg-red-50 dark:bg-red-900/30" : "bg-white/80 dark:bg-neutral-900/70"} hover:bg-white hover:shadow transition`}
            onClick={() => {
              if (editor2DRef && typeof editor2DRef.deleteSelection === "function") {
                editor2DRef.deleteSelection();
                setTool("select");
                return;
              }
              setTrashMode(!isTrashMode);
            }}
            title="Excluir seleção (clique) ou ativar lixeira"
          >
            <Trash2 className={`h-4 w-4 ${isTrashMode ? "text-red-500" : ""}`} />
          </button>

          {/* Separador */}
          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

          {/* 2.5) Densidade do stamp */}
          {tool === "stamp" && (
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-0.5 opacity-60">
                <Circle className="h-2 w-2 fill-current" />
                <Circle className="h-2 w-2 fill-current" />
                <Circle className="h-2 w-2 fill-current" />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={stampDensity}
                onChange={(e) => setStampDensity?.(Number(e.target.value))}
                className="w-24 accent-current"
                aria-label="Densidade do molde"
                title={`Densidade: ${stampDensity}%`}
              />
              <span className="text-xs text-gray-500 tabular-nums min-w-[2.5rem]">{stampDensity}%</span>
            </div>
          )}

          {/* 3) Largura - aparece para lápis, linhas/curvas e ao selecionar formas */}
          {(tool === "brush" || tool === "line" || tool === "curve" || (tool === "select" && selectionKind !== "image")) && (
            <div className="h-9 min-w-[min(220px,90vw)] px-3 flex items-center gap-2 shadow rounded-xl glass-strong">
              <div className="flex flex-col gap-0.5 opacity-60">
                <Minus className="h-2 w-3" strokeWidth={1} />
                <Minus className="h-2 w-3" strokeWidth={2} />
                <Minus className="h-2 w-3" strokeWidth={3} />
              </div>
              <input
                type="range"
                min={1}
                max={60}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                onPointerUp={() => editor2DRef?.historyCapture?.()}
                className="floating-toolbar-slider"
                aria-label="Largura"
                title={`Largura: ${strokeWidth}px`}
              />
              <span className="text-xs text-gray-500 tabular-nums min-w-[2rem]">{strokeWidth}px</span>
            </div>
          )}

          {/* 4) Opacidade */}
          <div className="h-9 min-w-[min(220px,90vw)] px-3 flex items-center gap-2 shadow rounded-xl glass-strong">
            <Eye className="h-4 w-4 opacity-60" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              onPointerUp={() => editor2DRef?.historyCapture?.()}
              className="floating-toolbar-slider"
              aria-label="Opacidade"
              title={`Opacidade: ${Math.round(opacity * 100)}%`}
            />
            <span className="text-xs text-gray-500 tabular-nums min-w-[2.5rem]">{Math.round(opacity * 100)}%</span>
          </div>

          {/* Separador */}
          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

          {/* 5) Undo/Redo */}
          <button
            type="button"
            aria-label="Desfazer"
            className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
            onClick={onUndo}
            disabled={canUndo === false}
            title="Desfazer (Ctrl/Cmd+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Refazer"
            className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
            onClick={onRedo}
            disabled={canRedo === false}
            title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          {/* Separador */}
          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

          {/* 6) Cursor (select) */}
          <button
            type="button"
            aria-label="Ferramenta de seleção"
            className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
            onClick={() => setTool("select")}
            title="Selecionar (V)"
          >
            <MousePointer2 className="h-4 w-4" />
          </button>
        </div>

        {/* Badge modo removido */}
      </div>
    </div>
  );
}
