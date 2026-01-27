// src/components/FloatingEditorToolbar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const swatchBarTimeout = useRef<NodeJS.Timeout | null>(null);

  // aplica cor em tempo real ao arrastar (com rAF)
  const [svDragging, setSvDragging] = useState(false);
  const [hueDragging, setHueDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!(svDragging || hueDragging)) return;
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
                <div className="rounded-2xl p-3 w-[320px] bg-white/90 dark:bg-neutral-900/95 border border-black/10 dark:border-white/10">
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
                    className="mt-3 h-4 rounded-full cursor-ew-resize"
                    style={{
                      background:
                        "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                    }}
                    onPointerDown={onHuePointer}
                    onPointerMove={(e) => hueDragging && onHuePointer(e)}
                    onPointerUp={() => { setHueDragging(false); editor2DRef?.historyCapture?.(); }}
                    onPointerLeave={() => setHueDragging(false)}
                  >
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white shadow -mt-0.5"
                      style={{ transform: `translateX(${(h / 360) * 100}%)` }}
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
            <div className="h-9 min-w-[220px] px-3 flex items-center gap-2 bg-white/30 dark:bg-neutral-900/60 backdrop-blur-md border border-white/20 dark:border-black/20 shadow rounded-xl">
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
          <div className="h-9 min-w-[220px] px-3 flex items-center gap-2 bg-white/30 dark:bg-neutral-900/60 backdrop-blur-md border border-white/20 dark:border-black/20 shadow rounded-xl">
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
