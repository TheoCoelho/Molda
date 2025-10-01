// src/components/FloatingEditorToolbar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Droplet,
  Trash2,
  SlidersHorizontal,
  Undo2,
  Redo2,
  MousePointer2,
  Pipette,
} from "lucide-react";

/** ===== Tipos ===== */
type Props = { mode?: "2D" | "3D" };

/** ===== Utils ===== */
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function hsvToRgb(h: number, s: number, v: number) {
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
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)] as const;
}
const toHex = (n: number) => n.toString(16).padStart(2, "0");
function rgbToHex(r: number, g: number, b: number) { return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase(); }
function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const intVal = parseInt(m[1], 16);
  return [(intVal >> 16) & 255, (intVal >> 8) & 255, intVal & 255] as const;
}
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d === 0) h = 0;
  else if (max === r) h = ((g - b) / d) * 60 + (g < b ? 360 : 0);
  else if (max === g) h = ((b - r) / d) * 60 + 120;
  else h = ((r - g) / d) * 60 + 240;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v] as const;
}
function hexToHsv(hex: string) { const rgb = hexToRgb(hex); if (!rgb) return null; return rgbToHsv(rgb[0], rgb[1], rgb[2]); }
function hsvToHex(h: number, s: number, v: number) { const [r, g, b] = hsvToRgb(h, s, v); return rgbToHex(r, g, b); }

/** ===== Paletas ===== */
const DEFAULT_COLORS = [
  "#000000","#333333","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF3B30","#FF9500","#FFCC00","#34C759","#00C7BE","#007AFF",
  "#5856D6","#AF52DE","#FF2D55","#FF9F0A","#FFD60A","#30D158",
  "#64D2FF","#0A84FF","#5E5CE6","#BF5AF2","#FF375F",
].map((s) => s.toUpperCase());

/** ===== Componente ===== */
export default function FloatingEditorToolbar({ mode = "2D" }: Props) {
  // refs e medidas
  const barRef = useRef<HTMLDivElement>(null);
  const dropWrapRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState<number>(0);
  const [dropletLeft, setDropletLeft] = useState<number>(0);
  const [swatchWidth, setSwatchWidth] = useState<number>(0);

  // cor atual (HSV + HEX)
  const [h, setH] = useState<number>(0);
  const [s, setS] = useState<number>(1);
  const [v, setV] = useState<number>(1);
  const currentHex = useMemo(() => hsvToHex(h, s, v), [h, s, v]);
  const [hexInput, setHexInput] = useState<string>(currentHex);

  // painel e hover
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [showSwatchBar, setShowSwatchBar] = useState(false);

  // cores recomendadas (dinâmicas)
  const [recents, setRecents] = useState<string[]>(["#1677FF", ...DEFAULT_COLORS]);

  // layout da faixa
  const SWATCH_SIZE = 28;
  const GAP = 8;
  const [maxSwatches, setMaxSwatches] = useState<number>(10);

  // refs do painel SV/Hue
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [svDragging, setSvDragging] = useState(false);
  const [hueDragging, setHueDragging] = useState(false);

  // medir largura disponível da faixa (do início da gota até o fim da toolbar)
  useEffect(() => {
    if (!barRef.current) return;
    const measure = () => {
      const barRect = barRef.current!.getBoundingClientRect();
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
    ro.observe(barRef.current);
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
      filled.push(DEFAULT_COLORS[i % DEFAULT_COLORS.length]); i++;
    }
    return filled.slice(0, maxSwatches);
  }, [recents, maxSwatches]);

  // sincronizar campo HEX
  useEffect(() => { setHexInput(currentHex); }, [currentHex]);

  // aplicar cor escolhida → vai para o início da lista
  const applyPickedColor = (hex: string) => {
    const hsv = hexToHsv(hex);
    if (hsv) {
      setH(hsv[0]); setS(hsv[1]); setV(hsv[2]);
      setRecents((prev) => {
        const noDup = prev.filter((c) => c.toUpperCase() !== hex.toUpperCase());
        return [hex.toUpperCase(), ...noDup].slice(0, 64);
      });
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
    if (/^#([0-9A-F]{6})$/.test(val)) applyPickedColor(val);
  };

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 select-none">
      <div className="group relative">
        {/* ====== TOOLBAR ====== */}
        <div
          ref={barRef}
          className="rounded-2xl px-3 py-2 backdrop-blur-md bg-white/70 dark:bg-neutral-900/60 shadow-lg border border-black/5 dark:border-white/10 flex items-center gap-2"
        >
          {/* 1) GOTa + paleta */}
          <div
            ref={dropWrapRef}
            className="relative"
            onMouseEnter={() => !isColorPanelOpen && setShowSwatchBar(true)}
            onMouseLeave={() => !isColorPanelOpen && setShowSwatchBar(false)}
          >
            <button
              type="button"
              aria-label="Selecionar cor"
              className="h-10 w-10 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
              onClick={() => { setIsColorPanelOpen((v) => !v); setShowSwatchBar(false); }}
            >
              <Droplet className="h-5 w-5" />
            </button>

            {/* ===== PAINEL DE COR (ACIMA) ===== */}
            {isColorPanelOpen && (
              <div className="absolute left-0 bottom-full mb-3 z-30">
                <div className="rounded-2xl p-3 w-[320px] bg-white shadow-xl border border-black/10 dark:bg-neutral-900 dark:border-white/10">
                  {/* S/V */}
                  <div
                    ref={svRef}
                    className="relative h-[160px] rounded-xl overflow-hidden cursor-crosshair"
                    style={{ backgroundColor: `hsl(${h},100%,50%)` }}
                    onPointerDown={onSvPointer}
                    onPointerMove={(e) => svDragging && onSvPointer(e)}
                    onPointerUp={() => setSvDragging(false)}
                    onPointerLeave={() => setSvDragging(false)}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff,transparent)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_top,#000,transparent)]" />
                    <div
                      className="absolute h-4 w-4 rounded-full border-2 border-white shadow"
                      style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, transform: "translate(-50%, -50%)", background: currentHex }}
                    />
                  </div>

                  {/* Hue */}
                  <div
                    ref={hueRef}
                    className="relative mt-3 h-4 rounded-full cursor-pointer overflow-hidden"
                    onPointerDown={onHuePointer}
                    onPointerMove={(e) => hueDragging && onHuePointer(e)}
                    onPointerUp={() => setHueDragging(false)}
                    onPointerLeave={() => setHueDragging(false)}
                    style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
                  >
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white shadow"
                      style={{ left: `${(h / 360) * 100}%`, transform: "translate(-50%, -50%)", background: currentHex }}
                    />
                  </div>

                  {/* HEX + pipette (visual) */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-10 rounded-xl border px-3 flex items-center gap-2 text-sm border-violet-400/60 focus-within:border-violet-500/80 shadow-inner">
                      <div className="h-5 w-5 rounded-full border border-black/10" style={{ background: currentHex }} />
                      <input className="flex-1 outline-none bg-transparent" value={hexInput} onChange={onHexChange} spellCheck={false} aria-label="Código HEX" />
                    </div>
                    <button type="button" className="h-10 w-10 rounded-xl border bg-white/80 dark:bg-neutral-900/70 grid place-items-center" title="Conta-gotas do sistema (visual)">
                      <Pipette className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== FAIXA DE CORES (ACIMA), começa sobre a gota e cresce à direita ===== */}
            {showSwatchBar && !isColorPanelOpen && (
              <div
                className="absolute left-0 bottom-full mb-2"
                style={{ width: swatchWidth ? `${swatchWidth}px` : undefined }}
              >
                <div className="rounded-xl px-3 py-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur border border-black/5 dark:border-white/10 shadow">
                  <div className="flex items-center justify-between gap-0 flex-nowrap">
                    {displayPalette.map((c, idx) => (
                      <button
                        key={`${c}-${idx}`}
                        type="button"
                        className="h-7 w-7 rounded-full border border-black/10 dark:border-white/10 shadow-sm shrink-0"
                        style={{ backgroundColor: c }}
                        onClick={() => applyPickedColor(c)}
                        aria-label={`Usar cor ${c}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2) Lixeira (visual) */}
          <button
            type="button"
            aria-label="Excluir objeto selecionado"
            className="h-10 w-10 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition cursor-not-allowed"
            disabled
          >
            <Trash2 className="h-5 w-5" />
          </button>

          {/* Separador */}
          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

          {/* 3) Largura (visual) */}
          <div className="flex items-center gap-2">
            <div className="h-10 grid place-items-center">
              <SlidersHorizontal className="h-5 w-5 opacity-90" />
            </div>
            <input type="range" min={1} max={100} defaultValue={30} className="w-28 accent-current cursor-not-allowed" disabled aria-label="Largura" />
          </div>

          {/* 4) Opacidade (visual) */}
          <div className="flex items-center">
            <input type="range" min={1} max={100} defaultValue={80} className="w-28 accent-current cursor-not-allowed" disabled aria-label="Opacidade" />
          </div>

          {/* Separador */}
          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

          {/* 5) Undo (visual) */}
          <button type="button" aria-label="Desfazer (Ctrl+Z)" className="h-10 w-10 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition cursor-not-allowed" disabled>
            <Undo2 className="h-5 w-5" />
          </button>

          {/* 6) Redo (visual) */}
          <button type="button" aria-label="Refazer (Ctrl+Y)" className="h-10 w-10 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition cursor-not-allowed" disabled>
            <Redo2 className="h-5 w-5" />
          </button>

          {/* Separador */}
          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

          {/* 7) Cursor (visual) */}
          <button type="button" aria-label="Ferramenta de seleção" className="h-10 w-10 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition cursor-not-allowed" disabled>
            <MousePointer2 className="h-5 w-5" />
          </button>
        </div>

        {/* Badge modo (visual) */}
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-black/60 dark:text-white/60">
          {mode} canvas
        </div>
      </div>
    </div>
  );
}
