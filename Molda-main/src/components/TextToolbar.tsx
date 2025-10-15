// src/components/TextToolbar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Editor2DHandle, TextStyle } from "../components/Editor2D";
import { FONT_LIBRARY } from "../fonts/library";
import { loadFontFamily } from "../utils/fonts";
import {
  Minus,
  Plus,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Droplet,
  Pipette,
} from "lucide-react";

/** ===== Props ===== */
export default function TextToolbar({ editor, visible, position = "bottom" }: Props) {


/** ===== Helpers ===== */
function ToggleBtn({
  pressed,
  onClick,
  title,
  children,
}: React.PropsWithChildren<{ pressed?: boolean; onClick: () => void; title?: string }>) {
  return (
    <button
      type="button"
      title={title}
      className={[
        "h-9 min-w-9 px-2 rounded-md border",
        "flex items-center justify-center text-sm",
        pressed ? "bg-primary/10 border-primary/40" : "bg-background hover:bg-muted",
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

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

const DEFAULT_COLORS = [
  "#FF3B30", "#FF2D55", "#FF9500", "#FFCC00",
  "#34C759", "#30D158", "#5AC8FA", "#007AFF",
  "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F",
  "#8E8E93", "#AEAEB2", "#C7C7CC", "#D1D1D6",
  "#E5E5EA", "#F2F2F7", "#000000", "#FFFFFF",
];

/** Garante que a família está carregada no DOM antes de aplicar no Fabric */
async function ensureFontReady(
  family: string,
  weight: string | number = "400",
  styleCss: "normal" | "italic" = "normal"
) {
  try { await loadFontFamily(family); } catch {}
  try {
    if (typeof document !== "undefined" && (document as any).fonts?.load) {
      await (document as any).fonts.load(`${styleCss} ${String(weight)} 64px "${family}"`);
    }
  } catch {}
}

/** ===== Component ===== */
  const [style, setStyle] = useState<TextStyle>({
    fontFamily: FONT_LIBRARY[0]?.family || "Inter",
    fontSize: 32,
    fontWeight: "400",
    fontStyle: "normal",
    underline: false,
    fill: "#000000",
    textAlign: "left",
    lineHeight: 1.16,
    charSpacing: 0,
    stroke: undefined,
    strokeWidth: 0,
  });

  /** Atualiza a UI quando a seleção muda */
  const refreshFromSelection = async () => {
    const s = editor.current?.getActiveTextStyle?.();
    if (!s) return;

    const fam = (s as any).fontFamily ?? style.fontFamily;
    if (fam) {
      try {
        await ensureFontReady(
          fam,
          String((s as any).fontWeight ?? style.fontWeight ?? "400"),
          ((s as any).fontStyle ?? style.fontStyle ?? "normal") as "normal" | "italic"
        );
      } catch {}
    }
    setStyle((prev) => ({ ...prev, ...s, fontFamily: fam ?? prev.fontFamily }));
  };

  useEffect(() => {
    editor.current?.onSelectionChange?.((kind) => {
      if (kind === "text") refreshFromSelection();
    });
  }, [editor]);
  useEffect(() => { if (visible) refreshFromSelection(); }, [visible]);

  /** Aplica mudanças preservando a fonte viva e corrigindo contorno */
  const apply = async (partial: Partial<TextStyle>) => {
    // 1) pegue a font "viva" diretamente do objeto selecionado
    const live = editor.current?.getActiveTextStyle?.() || {};
    const currentFamily =
      (partial.fontFamily as string) ??
      ((live as any).fontFamily as string) ??
      (style.fontFamily as string) ??
      "Inter";

    // 2) garanta que ela está realmente carregada
    const weightNow = String(partial.fontWeight ?? (live as any).fontWeight ?? style.fontWeight ?? "400");
    const italicNow = (partial.fontStyle ?? (live as any).fontStyle ?? style.fontStyle ?? "normal") as "normal" | "italic";
    await ensureFontReady(currentFamily, weightNow, italicNow);

    // 3) atualize o estado da UI
    const next: TextStyle = { ...style, ...partial, fontFamily: currentFamily };
    setStyle(next);

    // 4) monte SÓ o patch a aplicar no Fabric
    const patch: any = { ...partial, fontFamily: currentFamily };

    // 5) manter a correção do contorno (stroke antes do fill)
    const strokeW = partial.strokeWidth !== undefined ? Number(partial.strokeWidth) : Number(next.strokeWidth || 0);
    const strokeC = (partial.stroke !== undefined ? (partial.stroke as any) : (next.stroke as any)) || undefined;
    const hasStroke = !!strokeC && strokeW > 0;
    Object.assign(
      patch,
      hasStroke
        ? { paintFirst: "stroke", strokeUniform: true, strokeLineJoin: "round" }
        : { paintFirst: "fill" }
    );

    // 6) aplica somente o patch (com a fontFamily viva sempre presente)
    await editor.current?.setActiveTextStyle(patch);
  };

  /** Tamanho da fonte */
  const decFont = () => apply({ fontSize: Math.max(6, Math.round((style.fontSize || 12) - 1)) });
  const incFont = () => apply({ fontSize: Math.min(512, Math.round((style.fontSize || 12) + 1)) });
  const setFontSizeFromInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isNaN(n)) apply({ fontSize: Math.max(6, Math.min(512, Math.round(n))) });
  };

  /** ====== Seletor de cor (hover popover + painel HSV) ====== */
  const [reduceFx, setReduceFx] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduceFx(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceFx(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const currentFill = (style.fill as string) || "#000000";
  const initialHSV = useMemo(() => hexToHsv(currentFill) || [0, 0, 0], [currentFill]);
  const [h, setH] = useState<number>(initialHSV[0]);
  const [s, setS] = useState<number>(initialHSV[1]);
  const [v, setV] = useState<number>(initialHSV[2]);
  useEffect(() => {
    const hsv = hexToHsv((style.fill as string) || "#000000");
    if (hsv) { setH(hsv[0]); setS(hsv[1]); setV(hsv[2]); }
  }, [style.fill]);
  const currentHex = useMemo(() => hsvToHex(h, s, v), [h, s, v]);
  const [hexInput, setHexInput] = useState<string>(currentHex);
  useEffect(() => setHexInput(currentHex), [currentHex]);

  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [showSwatchBar, setShowSwatchBar] = useState(false);
  const swatchBarTimeout = useRef<NodeJS.Timeout | null>(null);

  const barRef = useRef<HTMLDivElement>(null);
  const dropWrapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // ===== Medidas para faixa tipo Floating (ancorada na gota e crescendo à direita) =====
  const SWATCH_SIZE = 28;
  const GAP = 8;
  const INTERNAL_PADDING = 24;
  const [likeFloatingLeft, setLikeFloatingLeft] = useState(0);
  const [likeFloatingWidth, setLikeFloatingWidth] = useState(520);
  const [maxSwatches, setMaxSwatches] = useState(16);

  useEffect(() => {
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const barEl = barRef.current;
      const dropEl = dropWrapRef.current;
      if (!barEl || !dropEl) return;

      const barRect = barEl.getBoundingClientRect();
      const dropRect = dropEl.getBoundingClientRect();
      const leftFromBar = dropRect.left - barRect.left;
      const widthLikeFloating = Math.max(320, barRect.width - leftFromBar);

      setLikeFloatingLeft(leftFromBar);
      setLikeFloatingWidth(widthLikeFloating);

      const available = Math.max(0, widthLikeFloating - INTERNAL_PADDING);
      const n = Math.max(10, Math.floor(available / (SWATCH_SIZE + GAP)));
      setMaxSwatches(n);
    };

    const ro = new ResizeObserver(measure);
    const barEl = barRef.current;
    const dropEl = dropWrapRef.current;

    measure();
    if (barEl) ro.observe(barEl);
    if (dropEl) ro.observe(dropEl);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      try { if (barEl) ro.unobserve(barEl); } catch {}
      try { if (dropEl) ro.unobserve(dropEl); } catch {}
      try { ro.disconnect(); } catch {}
    };
  }, [visible]);

  // aplica cor em tempo real ao arrastar no painel HSV
  const [svDragging, setSvDragging] = useState(false);
  const [hueDragging, setHueDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!(svDragging || hueDragging)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      apply({ fill: hsvToHex(h, s, v) });
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, s, v, svDragging, hueDragging]);

  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("textToolbar.recents");
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
    try { localStorage.setItem("textToolbar.recents", JSON.stringify(recents)); } catch {}
  }, [recents]);

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

  const applyPickedColor = (hex: string) => {
    const hsv = hexToHsv(hex);
    if (hsv) {
      setH(hsv[0]); setS(hsv[1]); setV(hsv[2]);
      setRecents((prev) => {
        const noDup = prev.filter((c) => c.toUpperCase() !== hex.toUpperCase());
        return [hex.toUpperCase(), ...noDup].slice(0, 64);
      });
      apply({ fill: hex.toUpperCase() });
      editor.current?.historyCapture?.();
    }
  };

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
      editor.current?.historyCapture?.();
    }
  };

  const onEyedrop = async () => {
    const pick = (editor.current as any)?.pickColorFromCanvas;
    if (typeof pick === "function") {
      const picked: string | null = await pick();
      if (picked) applyPickedColor(picked);
    }
  };

  // fecha painel/faixa ao clicar fora/ESC e ao ocultar a toolbar
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setIsColorPanelOpen(false);
        setShowSwatchBar(false);
      }
    };
    const onPointerDown = (ev: PointerEvent) => {
      if (!barRef.current) return;
      if (!barRef.current.contains(ev.target as Node)) {
        setIsColorPanelOpen(false);
        setShowSwatchBar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);
  useEffect(() => {
    if (!visible) {
      setIsColorPanelOpen(false);
      setShowSwatchBar(false);
      if (swatchBarTimeout.current) {
        clearTimeout(swatchBarTimeout.current);
        swatchBarTimeout.current = null;
      }
    }
  }, [visible]);

  const toolbar = (
    <div
      ref={barRef}
      className={[
        "relative",
        "flex items-center gap-2 p-2 rounded-2xl border shadow-lg bg-background",
        "backdrop-blur supports-[backdrop-filter]:bg-background/90",
      ].join(" ")}
      role="toolbar"
      aria-label="Configurações de texto"
    >
      {/* Tamanho */}
      <div className="flex items-center gap-1">
        <ToggleBtn title="Diminuir" onClick={decFont}><Minus size={16} /></ToggleBtn>
        <input
          title="Tamanho"
          type="number"
          className="h-9 w-16 text-center border rounded-md bg-background text-sm"
          value={Math.round(style.fontSize || 12)}
          onChange={setFontSizeFromInput}
        />
        <ToggleBtn title="Aumentar" onClick={incFont}><Plus size={16} /></ToggleBtn>
      </div>

      {/* Cor do texto (gota + painel) */}
      <div ref={dropWrapRef} className="relative">
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
          <button
            type="button"
            title="Cor do texto"
            aria-label="Abrir seleção de cores do texto"
            className="h-9 w-9 grid place-items-center rounded-md border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
            onClick={() => { setIsColorPanelOpen((v) => !v); setShowSwatchBar(false); }}
          >
            <Droplet className="h-4 w-4" />
          </button>
        </div>

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
                onPointerUp={() => { setSvDragging(false); editor.current?.historyCapture?.(); }}
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
                onPointerUp={() => { setHueDragging(false); editor.current?.historyCapture?.(); }}
                onPointerLeave={() => setHueDragging(false)}
              >
                <div
                  className="h-4 w-4 rounded-full border-2 border-white shadow -mt-0.5"
                  style={{ transform: `translateX(${(h / 360) * 100}%)` }}
                />
              </div>

              {/* HEX + Eyedropper */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  aria-label="Cor em HEX"
                  value={hexInput}
                  onChange={onHexChange}
                  onBlur={() => editor.current?.historyCapture?.()}
                  maxLength={7}
                  className="w-28 px-2 py-1 rounded border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 text-sm"
                  placeholder="#000000"
                />
                <div className="flex-1" />
                <button
                  type="button"
                  className="h-9 w-9 rounded-md border bg-white/70 dark:bg-neutral-800/70 border-black/10 dark:border-white/10 grid place-items-center"
                  title="Conta-gotas (se disponível)"
                  onClick={onEyedrop}
                >
                  <Pipette className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FAIXA de cores recomendadas (âncora na gota, largura ampla) */}
      {showSwatchBar && !isColorPanelOpen && (
        <div
          className="absolute bottom-full mb-2 z-30"
          style={{ left: likeFloatingLeft, width: likeFloatingWidth }}
          onMouseEnter={() => {
            if (swatchBarTimeout.current) clearTimeout(swatchBarTimeout.current);
            setShowSwatchBar(true);
          }}
          onMouseLeave={() => {
            if (swatchBarTimeout.current) clearTimeout(swatchBarTimeout.current);
            swatchBarTimeout.current = setTimeout(() => setShowSwatchBar(false), 90);
          }}
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

      {/* Peso/Estilo/Decorações */}
      <div className="flex items-center gap-1">
        <ToggleBtn
          title="Negrito"
          pressed={String(style.fontWeight || "400") === "700" || String(style.fontWeight || "") === "bold"}
          onClick={() =>
            apply({
              fontWeight:
                String(style.fontWeight || "400") === "700" || String(style.fontWeight || "") === "bold"
                  ? "400"
                  : "700",
            })
          }
        >
          <Bold size={16} />
        </ToggleBtn>

        <ToggleBtn
          title="Itálico"
          pressed={style.fontStyle === "italic"}
          onClick={() => apply({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}
        >
          <Italic size={16} />
        </ToggleBtn>

        <ToggleBtn
          title="Sublinhado"
          pressed={!!style.underline}
          onClick={() => apply({ underline: !style.underline })}
        >
          <Underline size={16} />
        </ToggleBtn>

        <ToggleBtn
          title="Tachado"
          pressed={!!(style as any).linethrough}
          onClick={() => apply({ ...(style as any), linethrough: !(style as any).linethrough })}
        >
          <Strikethrough size={16} />
        </ToggleBtn>
      </div>

      {/* Alinhamento */}
      <div className="flex items-center gap-1">
        <ToggleBtn title="Alinhar à esquerda" pressed={style.textAlign === "left"} onClick={() => apply({ textAlign: "left" })}>
          <AlignLeft size={16} />
        </ToggleBtn>
        <ToggleBtn title="Centralizar" pressed={style.textAlign === "center"} onClick={() => apply({ textAlign: "center" })}>
          <AlignCenter size={16} />
        </ToggleBtn>
        <ToggleBtn title="Alinhar à direita" pressed={style.textAlign === "right"} onClick={() => apply({ textAlign: "right" })}>
          <AlignRight size={16} />
        </ToggleBtn>
        <ToggleBtn title="Justificar" pressed={style.textAlign === "justify"} onClick={() => apply({ textAlign: "justify" })}>
          <AlignJustify size={16} />
        </ToggleBtn>
      </div>

      {/* Espaçamento (charSpacing) */}
      <div className="flex items-center gap-1">
        <div className="text-xs px-1 opacity-80" title="Espaçamento entre letras (charSpacing)">aA</div>
        <input
          title="Char spacing (milésimos)"
          type="number"
          className="h-9 w-16 text-center border rounded-md bg-background text-sm"
          value={Math.round(style.charSpacing || 0)}
          step={10}
          onChange={(e) => apply({ charSpacing: Number(e.target.value) || 0 })}
        />
      </div>

      {/* Contorno (stroke) — corrigido para não sobrepor o fill */}
      <div className="flex items-center gap-1">
        <div className="text-xs px-1 opacity-80" title="Cor do contorno">S</div>
        <input
          title="Cor do contorno"
          type="color"
          className="h-9 w-10 rounded-md border bg-background p-1"
          value={(style.stroke as string) || "#000000"}
          onChange={(e) => apply({ stroke: e.target.value })}
        />
        <input
          title="Espessura do contorno"
          type="number"
          className="h-9 w-16 text-center border rounded-md bg-background text-sm"
          value={Number(style.strokeWidth || 0)}
          min={0}
          max={20}
          step={0.5}
          onChange={(e) => apply({ strokeWidth: Number(e.target.value) || 0 })}
        />
      </div>
    </div>
  );

if (!visible) return null;

if (position === "top") {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[60]">
      {toolbar}
    </div>
  );
}
if (position === "bottom") {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60]"
      style={{ maxWidth: "95%" }}
    >
      {toolbar}
    </div>
  );
}
// "inline": sem wrapper posicionado (deixe o pai controlar)
return toolbar;

}
