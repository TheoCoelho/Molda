// src/components/TextToolbar.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Editor2DHandle, TextStyle, GradientFill, GradientStop } from "../components/Editor2D";
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
type Props = {
  editor: { current: Editor2DHandle | null };
  visible: boolean;
  position?: "top" | "bottom" | "inline";
};

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
          "h-9 min-w-9 px-2 rounded-full border-none shadow-none",
          "flex items-center justify-center text-sm",
          pressed ? "bg-primary/10" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
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
    else[r, g, b] = [c, 0, x];
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
    try { await loadFontFamily(family); } catch { }
    try {
      if (typeof document !== "undefined" && (document as any).fonts?.load) {
        await (document as any).fonts.load(`${styleCss} ${String(weight)} 64px "${family}"`);
      }
    } catch { }
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
      } catch { }
    }
    setStyle((prev) => ({ ...prev, ...s, fontFamily: fam ?? prev.fontFamily }));
  };

  useEffect(() => {
    editor.current?.onSelectionChange?.((kind: "none" | "text" | "image" | "other") => {
      if (kind === "text") refreshFromSelection();
    });
  }, [editor]);
  useEffect(() => { if (visible) refreshFromSelection(); }, [visible]);

  /** Aplica mudanças preservando a fonte viva e corrigindo contorno */
  const apply = async (partial: Partial<TextStyle>) => {
    // 1) pegue a font "viva" diretamente do objeto selecionado — SINCRONO, antes de qualquer await
    const liveBeforeAwait = editor.current?.getActiveTextStyle?.() || {};
    const currentFamily =
      (partial.fontFamily as string) ??
      ((liveBeforeAwait as any).fontFamily as string) ??
      "Inter";

    // 2) garanta que ela está realmente carregada
    const weightNow = String(partial.fontWeight ?? (liveBeforeAwait as any).fontWeight ?? "400");
    const italicNow = (partial.fontStyle ?? (liveBeforeAwait as any).fontStyle ?? "normal") as "normal" | "italic";
    await ensureFontReady(currentFamily, weightNow, italicNow);

    // 3) atualize o estado da UI (funcional para evitar closures com estado stale)
    setStyle((prev) => ({ ...prev, ...partial, fontFamily: currentFamily }));

    // 4) monte SÓ o patch a aplicar no Fabric
    const patch: any = { ...partial, fontFamily: currentFamily };

    // 5) manter a correção do contorno (stroke antes do fill)
    const strokeW = partial.strokeWidth !== undefined ? Number(partial.strokeWidth) : Number((liveBeforeAwait as any).strokeWidth || 0);
    const strokeC = (partial.stroke !== undefined ? (partial.stroke as any) : ((liveBeforeAwait as any).stroke as any)) || undefined;
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

  const currentFill = (typeof style.fill === 'string' ? style.fill : null) || "#000000";
  const initialHSV = useMemo(() => hexToHsv(currentFill) || [0, 0, 0], [currentFill]);
  const [h, setH] = useState<number>(initialHSV[0]);
  const [s, setS] = useState<number>(initialHSV[1]);
  const [v, setV] = useState<number>(initialHSV[2]);
  useEffect(() => {
    if (typeof style.fill !== 'string') return; // skip gradient fills
    const hsv = hexToHsv(style.fill || "#000000");
    if (hsv) { setH(hsv[0]); setS(hsv[1]); setV(hsv[2]); }
  }, [style.fill]);
  const currentHex = useMemo(() => hsvToHex(h, s, v), [h, s, v]);
  const [hexInput, setHexInput] = useState<string>(currentHex);
  useEffect(() => setHexInput(currentHex), [currentHex]);

  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [showSwatchBar, setShowSwatchBar] = useState(false);
  const swatchBarTimeout = useRef<NodeJS.Timeout | null>(null);

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
  const gradApplyingRef = useRef(false); // guard against sync feedback loop

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
      try { if (barEl) ro.unobserve(barEl); } catch { }
      try { if (dropEl) ro.unobserve(dropEl); } catch { }
      try { ro.disconnect(); } catch { }
    };
  }, [visible]);

  // aplica cor em tempo real ao arrastar no painel HSV
  const [svDragging, setSvDragging] = useState(false);
  const [hueDragging, setHueDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!(svDragging || hueDragging)) return;
    if (colorMode !== 'solid') return; // não interferir com o modo degradê
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
    } catch { }
    return ["#1677FF", ...DEFAULT_COLORS];
  });
  useEffect(() => {
    try { localStorage.setItem("textToolbar.recents", JSON.stringify(recents)); } catch { }
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

  // Sincroniza estado do gradient quando seleção muda (não quando nós mesmos aplicamos)
  useEffect(() => {
    if (gradApplyingRef.current) return; // skip: we just applied this
    const fillVal = style.fill;
    if (fillVal && typeof fillVal === 'object' && (fillVal as any).type === 'gradient') {
      const gf = fillVal as GradientFill;
      setColorMode('gradient');
      setGradStops(gf.colorStops.length >= 2 ? gf.colorStops : [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#FFFFFF' },
      ]);
      setGradAngle(gf.angle || 0);
      setSelectedStopIdx(0);
    }
  }, [style.fill]);

  // Ref para sempre acessar a versão mais recente de apply (evita stale closure)
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });

  // Aplica degradê em tempo real enquanto arrasta
  const applyGradient = useCallback((stops: GradientStop[], angle: number) => {
    gradApplyingRef.current = true;
    const gradFill: GradientFill = {
      type: 'gradient',
      gradientType: 'linear',
      angle,
      colorStops: stops,
    };
    applyRef.current({ fill: gradFill as any });
    // Limpa a flag após o React processar o re-render
    requestAnimationFrame(() => { gradApplyingRef.current = false; });
  }, []);

  // Handler do stop drag na barra
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

  // Aplica em tempo real quando stops ou ângulo mudam durante drag
  const gradRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!stopDragging && colorMode !== 'gradient') return;
    if (colorMode !== 'gradient') return;
    if (gradRafRef.current) cancelAnimationFrame(gradRafRef.current);
    gradRafRef.current = requestAnimationFrame(() => {
      applyGradient(gradStops, gradAngle);
    });
    return () => {
      if (gradRafRef.current) cancelAnimationFrame(gradRafRef.current);
      gradRafRef.current = null;
    };
  }, [gradStops, gradAngle, stopDragging, colorMode]);

  // Gera CSS do degradê para preview
  const gradientCSS = useMemo(() => {
    const sorted = [...gradStops].sort((a, b) => a.offset - b.offset);
    const stopsStr = sorted.map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
    return `linear-gradient(${gradAngle}deg, ${stopsStr})`;
  }, [gradStops, gradAngle]);

  // HSV do stop selecionado
  const selectedStop = gradStops[selectedStopIdx] || gradStops[0];
  const selectedStopHSV = useMemo(() => hexToHsv(selectedStop?.color || '#000000') || [0, 0, 0], [selectedStop?.color]);

  // Atualiza a cor do stop selecionado via HSV
  const updateSelectedStopColor = useCallback((hex: string) => {
    setGradStops(prev => {
      const next = [...prev];
      if (next[selectedStopIdx]) {
        next[selectedStopIdx] = { ...next[selectedStopIdx], color: hex.toUpperCase() };
      }
      return next;
    });
  }, [selectedStopIdx]);

  // Adicionar stop
  const addGradStop = useCallback(() => {
    setGradStops(prev => {
      if (prev.length >= 8) return prev; // limite
      const sorted = [...prev].sort((a, b) => a.offset - b.offset);
      // Encontra o maior gap e insere no meio
      let maxGap = 0, gapIdx = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].offset - sorted[i].offset;
        if (gap > maxGap) { maxGap = gap; gapIdx = i; }
      }
      const newOffset = (sorted[gapIdx].offset + sorted[gapIdx + 1].offset) / 2;
      // Interpola cor
      const c1 = sorted[gapIdx].color;
      const c2 = sorted[gapIdx + 1].color;
      const midColor = interpolateHex(c1, c2, 0.5);
      const newStops = [...prev, { offset: Math.round(newOffset * 100) / 100, color: midColor }];
      setSelectedStopIdx(newStops.length - 1);
      return newStops;
    });
  }, []);

  // Remover stop
  const removeGradStop = useCallback((idx: number) => {
    setGradStops(prev => {
      if (prev.length <= 2) return prev; // mínimo 2
      const next = prev.filter((_, i) => i !== idx);
      setSelectedStopIdx(si => Math.min(si, next.length - 1));
      return next;
    });
  }, []);

  // Helper: interpolar cor entre dois hex
  function interpolateHex(hex1: string, hex2: string, t: number): string {
    const h1 = hexToHsv(hex1) || [0, 0, 0];
    const h2 = hexToHsv(hex2) || [0, 0, 0];
    return hsvToHex(
      h1[0] + (h2[0] - h1[0]) * t,
      h1[1] + (h2[1] - h1[1]) * t,
      h1[2] + (h2[2] - h1[2]) * t,
    );
  }

  const toolbar = (
    <div
      ref={barRef}
      className="relative flex items-center gap-2 p-2"
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

      {/* Separador visual */}
      <div className="mx-2 h-8 w-px bg-black/20 dark:bg-white/20 opacity-60" />

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
                    // Ao mudar para sólido, aplica a cor do primeiro stop ou a cor atual
                    const hex = hsvToHex(h, s, v);
                    apply({ fill: hex });
                    editor.current?.historyCapture?.();
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
                    // Ao mudar para degradê, aplica o gradient inicial
                    applyGradient(gradStops, gradAngle);
                    editor.current?.historyCapture?.();
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
                        apply({ fill: hsvToHex(x * 360, s, v) });
                        editor.current?.historyCapture?.();
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
                      onPointerUp={() => { setHueDragging(false); editor.current?.historyCapture?.(); }}
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
                      // Clicar na barra (não num stop) adiciona um stop na posição
                      const target = e.target as HTMLElement;
                      if (target === gradBarRef.current) {
                        const rect = gradBarRef.current!.getBoundingClientRect();
                        const offset = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                        const sorted = [...gradStops].sort((a, b) => a.offset - b.offset);
                        // Encontra as cores vizinhas
                        let leftC = sorted[0]?.color || '#000000';
                        let rightC = sorted[sorted.length - 1]?.color || '#FFFFFF';
                        for (let i = 0; i < sorted.length - 1; i++) {
                          if (offset >= sorted[i].offset && offset <= sorted[i + 1].offset) {
                            leftC = sorted[i].color;
                            rightC = sorted[i + 1].color;
                            break;
                          }
                        }
                        const t = 0.5;
                        const newColor = interpolateHex(leftC, rightC, t);
                        setGradStops(prev => {
                          if (prev.length >= 8) return prev;
                          const next = [...prev, { offset: Math.round(offset * 100) / 100, color: newColor }];
                          setSelectedStopIdx(next.length - 1);
                          return next;
                        });
                      }
                    }}
                  >
                    {/* Stop handles */}
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
                          editor.current?.historyCapture?.();
                        }}
                        onPointerLeave={() => {
                          if (stopDragging) {
                            setStopDragging(false);
                          }
                        }}
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
                      const newHex = hsvToHex(selectedStopHSV[0], x, 1 - y);
                      updateSelectedStopColor(newHex);
                    }}
                    onPointerMove={(e) => {
                      if (!svDragging) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                      const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
                      const newHex = hsvToHex(selectedStopHSV[0], x, 1 - y);
                      updateSelectedStopColor(newHex);
                    }}
                    onPointerUp={() => { setSvDragging(false); editor.current?.historyCapture?.(); }}
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
                    style={{
                      background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                    }}
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                        updateSelectedStopColor(hsvToHex(x * 360, selectedStopHSV[1], selectedStopHSV[2]));
                        editor.current?.historyCapture?.();
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
                      onPointerUp={() => { setHueDragging(false); editor.current?.historyCapture?.(); }}
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
                          editor.current?.historyCapture?.();
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
                        const v = Number(e.target.value) || 0;
                        setGradAngle(((v % 360) + 360) % 360);
                      }}
                      onBlur={() => editor.current?.historyCapture?.()}
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
                      onBlur={() => editor.current?.historyCapture?.()}
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
      <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[60] max-w-[95vw] w-fit">
        {toolbar}
      </div>
    );
  }
  if (position === "bottom") {
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60] max-w-[95vw] w-fit"
        style={{ width: "fit-content" }}
      >
        {toolbar}
      </div>
    );
  }
  // "inline": sem wrapper posicionado (deixe o pai controlar)
  return toolbar;

}
