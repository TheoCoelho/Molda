// src/components/ImageToolbar.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Crop,
  Scissors,
  Lasso,
  SlidersHorizontal,
  Sparkles,
  Move,
  Pipette,
  Wand2,
  Waves,
  Sun,
  Contrast,
  Droplets,
  Palette,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  PaintBucket,
  Paintbrush,
} from "lucide-react";
import type { Editor2DHandle, ImageAdjustments, ImageEffects, ImageEffectKind } from "../components/Editor2D";
import { Slider } from "../components/ui/slider";

type Props = {
  visible: boolean;
  editor?: { current: Editor2DHandle | null };
  /**
   * "top" e "bottom" seguem o mesmo padrão do TextToolbar.
   * "inline" deixa o pai controlar posicionamento.
   */
  position?: "top" | "bottom" | "inline";
};

type CropTool = "default" | "square" | "lasso" | "magic" | "color";
type EffectCategoryId = "color" | "deform" | "censor" | "overlay";

function IconBtn({
  title,
  children,
  onClick,
}: React.PropsWithChildren<{ title: string; onClick?: () => void }>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="h-9 w-9 grid place-items-center rounded-full bg-transparent border-none shadow-none hover:bg-black/5 dark:hover:bg-white/10 transition"
      onClick={onClick ?? (() => {})}
    >
      {children}
    </button>
  );
}

export default function ImageToolbar({ visible, editor, position = "bottom" }: Props) {
  if (!visible) return null;

  const levelsAreaRef = useRef<HTMLDivElement>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levelsPinned, setLevelsPinned] = useState(false);
  const levelsCloseTimerRef = useRef<number | null>(null);

  const cancelLevelsClose = () => {
    if (levelsCloseTimerRef.current) {
      window.clearTimeout(levelsCloseTimerRef.current);
      levelsCloseTimerRef.current = null;
    }
  };
  const scheduleLevelsClose = (delayMs = 180) => {
    cancelLevelsClose();
    levelsCloseTimerRef.current = window.setTimeout(() => {
      levelsCloseTimerRef.current = null;
      if (!levelsPinned) setLevelsOpen(false);
    }, delayMs);
  };

  const LEVELS_CLOSE_DELAY_MS = 520;
  const LEVELS_EDGE_FADE_PX = 56;

  const getLevelsMask = React.useCallback(() => {
    const e = LEVELS_EDGE_FADE_PX;
    // Multi-stop para parecer “sumindo gradativamente” sem linha dura.
    // (Os 2 primeiros/últimos px ficam totalmente transparentes para evitar marca.)
    const s0 = 0;
    const s1 = 2;
    const s2 = Math.round(e * 0.18);
    const s3 = Math.round(e * 0.38);
    const s4 = Math.round(e * 0.62);
    const s5 = Math.round(e * 0.82);
    const s6 = e;

    return (
      `linear-gradient(to right, ` +
      `rgba(0,0,0,0) ${s0}px, ` +
      `rgba(0,0,0,0) ${s1}px, ` +
      `rgba(0,0,0,0.12) ${s2}px, ` +
      `rgba(0,0,0,0.35) ${s3}px, ` +
      `rgba(0,0,0,0.65) ${s4}px, ` +
      `rgba(0,0,0,0.88) ${s5}px, ` +
      `rgba(0,0,0,1) ${s6}px, ` +
      `rgba(0,0,0,1) calc(100% - ${s6}px), ` +
      `rgba(0,0,0,0.88) calc(100% - ${s5}px), ` +
      `rgba(0,0,0,0.65) calc(100% - ${s4}px), ` +
      `rgba(0,0,0,0.35) calc(100% - ${s3}px), ` +
      `rgba(0,0,0,0.12) calc(100% - ${s2}px), ` +
      `rgba(0,0,0,0) calc(100% - ${s1}px), ` +
      `rgba(0,0,0,0) 100%)`
    );
  }, []);

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sepia, setSepia] = useState(0);
  const [grayscale, setGrayscale] = useState(0);
  const [hue, setHue] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [definition, setDefinition] = useState(0);
  const [highlights, setHighlights] = useState(0);
  const [shadows, setShadows] = useState(0);
  const [blackPoint, setBlackPoint] = useState(0);
  const [warmth, setWarmth] = useState(0);
  const [tint, setTint] = useState(0);

  // === Estado de Efeitos ===
  const effectsAreaRef = useRef<HTMLDivElement>(null);
  const effectsScrollRef = useRef<HTMLDivElement>(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [effectsPinned, setEffectsPinned] = useState(false);
  const [effectKind, setEffectKind] = useState<ImageEffectKind>("none");
  const [effectCategory, setEffectCategory] = useState<EffectCategoryId>("color");
  const [effectAmount, setEffectAmount] = useState(100); // 0-100 (será convertido para 0-1)
  const [effectMode, setEffectMode] = useState<"bucket" | "brush" | "lasso">("bucket");
  const [effectBrushSize, setEffectBrushSize] = useState(40);
  const [canScrollEffectsLeft, setCanScrollEffectsLeft] = useState(false);
  const [canScrollEffectsRight, setCanScrollEffectsRight] = useState(false);
  const effectsCloseTimerRef = useRef<number | null>(null);

  const cancelEffectsClose = () => {
    if (effectsCloseTimerRef.current) {
      window.clearTimeout(effectsCloseTimerRef.current);
      effectsCloseTimerRef.current = null;
    }
  };
  const scheduleEffectsClose = (delayMs = 180) => {
    cancelEffectsClose();
    effectsCloseTimerRef.current = window.setTimeout(() => {
      effectsCloseTimerRef.current = null;
      if (!effectsPinned) setEffectsOpen(false);
    }, delayMs);
  };

  const updateEffectsScrollState = () => {
    const el = effectsScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    setCanScrollEffectsLeft(left > 1);
    setCanScrollEffectsRight(left < max - 1);
  };

  const getEffectsMask = React.useCallback(() => {
    const e = 56;
    const s0 = 0;
    const s1 = 2;
    const s2 = Math.round(e * 0.18);
    const s3 = Math.round(e * 0.38);
    const s4 = Math.round(e * 0.62);
    const s5 = Math.round(e * 0.82);
    const s6 = e;
    return (
      `linear-gradient(to right, ` +
      `rgba(0,0,0,0) ${s0}px, ` +
      `rgba(0,0,0,0) ${s1}px, ` +
      `rgba(0,0,0,0.12) ${s2}px, ` +
      `rgba(0,0,0,0.35) ${s3}px, ` +
      `rgba(0,0,0,0.65) ${s4}px, ` +
      `rgba(0,0,0,0.88) ${s5}px, ` +
      `rgba(0,0,0,1) ${s6}px, ` +
      `rgba(0,0,0,1) calc(100% - ${s6}px), ` +
      `rgba(0,0,0,0.88) calc(100% - ${s5}px), ` +
      `rgba(0,0,0,0.65) calc(100% - ${s4}px), ` +
      `rgba(0,0,0,0.35) calc(100% - ${s3}px), ` +
      `rgba(0,0,0,0.12) calc(100% - ${s2}px), ` +
      `rgba(0,0,0,0) calc(100% - ${s1}px), ` +
      `rgba(0,0,0,0) 100%)`
    );
  }, []);

  const EFFECT_LIBRARY: { id: EffectCategoryId; label: string; presets: { kind: ImageEffectKind; label: string; icon: string }[] }[] = [
    {
      id: "color",
      label: "Cor",
      presets: [
        { kind: "cinematic", label: "Cinemático", icon: "🎬" },
        { kind: "vibrant", label: "Vibrante", icon: "🌈" },
        { kind: "noir", label: "Noir", icon: "⬛" },
        { kind: "pastel", label: "Pastel", icon: "🍬" },
        { kind: "film", label: "Filme", icon: "🎞️" },
        { kind: "vintage", label: "Vintage", icon: "📷" },
        { kind: "warm", label: "Quente", icon: "🔥" },
        { kind: "cold", label: "Frio", icon: "❄️" },
        { kind: "dramatic", label: "Dramático", icon: "🎭" },
        { kind: "fade", label: "Desbotado", icon: "☁️" },
        { kind: "grayscale", label: "P&B", icon: "◐" },
        { kind: "sepia", label: "Sépia", icon: "🟤" },
        { kind: "vignette", label: "Vinheta", icon: "⬤" },
      ],
    },
    {
      id: "deform",
      label: "Deformar",
      presets: [
        { kind: "swirl", label: "Swirl", icon: "🌀" },
        { kind: "wave", label: "Ondas", icon: "〰️" },
        { kind: "perspective", label: "Perspectiva", icon: "📐" },
      ],
    },
    {
      id: "censor",
      label: "Censura",
      presets: [
        { kind: "blur", label: "Desfoque", icon: "💧" },
        { kind: "pixelate", label: "Pixelar", icon: "⬜" },
        { kind: "invert", label: "Inverter", icon: "◑" },
      ],
    },
    {
      id: "overlay",
      label: "Respingo",
      presets: [
        { kind: "ink-splash-a", label: "Respingo A", icon: "🪣" },
        { kind: "ink-splash-b", label: "Respingo B", icon: "🩸" },
        { kind: "ink-splash-c", label: "Respingo C", icon: "🎨" },
      ],
    },
  ];

  const NEUTRAL_EFFECT_PRESETS: { kind: ImageEffectKind; label: string; icon: string }[] = [
    { kind: "none", label: "Original", icon: "⊘" },
  ];

  const findCategoryForKind = (kind: ImageEffectKind): EffectCategoryId => {
    const found = EFFECT_LIBRARY.find((cat) => cat.presets.some((p) => p.kind === kind));
    return found?.id ?? "color";
  };

  const visibleEffectPresets = React.useMemo(() => {
    const currentCat = EFFECT_LIBRARY.find((cat) => cat.id === effectCategory) ?? EFFECT_LIBRARY[0];
    return [...NEUTRAL_EFFECT_PRESETS, ...currentCat.presets];
  }, [effectCategory]);

  const applyEffect = (kind: ImageEffectKind, amount: number) => {
    const fx: ImageEffects = { kind, amount: amount / 100 };
    editor?.current?.applyActiveImageEffects?.(fx);
  };

  const handleEffectKindChange = (kind: ImageEffectKind) => {
    setEffectKind(kind);
    setEffectCategory(findCategoryForKind(kind));

    // Em modos regionais: só entra em edição ao selecionar um efeito.
    if (effectMode === "brush") {
      if (kind !== "none") editor?.current?.startEffectBrush?.(kind, effectAmount / 100, effectBrushSize);
      else editor?.current?.cancelEffectBrush?.();
      editor?.current?.cancelEffectLasso?.();
      return;
    }
    if (effectMode === "lasso") {
      if (kind !== "none") editor?.current?.startEffectLasso?.(kind, effectAmount / 100);
      else editor?.current?.cancelEffectLasso?.();
      editor?.current?.cancelEffectBrush?.();
      return;
    }

    // No modo bucket, aplica diretamente.
    applyEffect(kind, effectAmount);
  };

  const handleEffectAmountChange = (val: number) => {
    setEffectAmount(val);
    if (effectMode === "bucket") applyEffect(effectKind, val);
  };

  // Sincroniza efeitos com a imagem selecionada ao abrir
  useEffect(() => {
    if (!visible || !effectsOpen) return;
    const current = editor?.current?.getActiveImageEffects?.();
    if (!current) return;
    setEffectKind(current.kind ?? "none");
    setEffectCategory(findCategoryForKind(current.kind ?? "none"));
    setEffectAmount(Math.round((current.amount ?? 1) * 100));
    // Atualiza scroll state
    requestAnimationFrame(updateEffectsScrollState);
  }, [visible, effectsOpen, editor]);

  // Resize listener para efeitos
  useEffect(() => {
    if (!effectsOpen) return;
    const onResize = () => updateEffectsScrollState();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [effectsOpen]);

  // Fecha ao clicar fora quando pinned
  useEffect(() => {
    if (!effectsPinned) return;
    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (effectsAreaRef.current && effectsAreaRef.current.contains(target)) return;
      setEffectsPinned(false);
      setEffectsOpen(false);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      setEffectsPinned(false);
      setEffectsOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [effectsPinned]);

  const [activeSliderTip, setActiveSliderTip] = useState<
    | null
    | "brightness"
    | "contrast"
    | "saturation"
    | "sepia"
    | "grayscale"
    | "hue"
    | "sharpness"
    | "definition"
    | "highlights"
    | "shadows"
    | "blackPoint"
    | "warmth"
    | "tint"
    | "effectAmount"
    | "effectBrushSize"
  >(null);

  useEffect(() => {
    if (!activeSliderTip) return;
    const onUp = () => setActiveSliderTip(null);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [activeSliderTip]);

  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const tipLeftPercent = (value: number, min: number, max: number) => {
    if (max <= min) return 0;
    return clamp01((value - min) / (max - min)) * 100;
  };

  const Tip = ({
    show,
    leftPercent,
    text,
  }: {
    show: boolean;
    leftPercent: number;
    text: string;
  }) => {
    if (!show) return null;
    return (
      <div
        className="pointer-events-none absolute -top-7"
        style={{ left: `${leftPercent}%`, transform: "translateX(-50%)" }}
      >
        <div className="px-2 py-1 rounded-md text-[11px] leading-none bg-background border border-black/10 dark:border-white/10 shadow-sm">
          {text}
        </div>
      </div>
    );
  };

  const levelsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateLevelsScrollState = () => {
    const el = levelsScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    setCanScrollLeft(left > 1);
    setCanScrollRight(left < max - 1);
  };

  const getAdj = (): ImageAdjustments => ({
    brightness,
    contrast,
    saturation,
    sepia,
    grayscale,
    hue,
    sharpness,
    definition,
    highlights,
    shadows,
    blackPoint,
    warmth,
    tint,
    shadowOn: false,
    shadowBlur: 0,
    shadowOpacity: 0,
  });

  const levelsIsDefault =
    brightness === 100 &&
    contrast === 100 &&
    saturation === 100 &&
    sepia === 0 &&
    grayscale === 0 &&
    hue === 0 &&
    sharpness === 0 &&
    definition === 0 &&
    highlights === 0 &&
    shadows === 0 &&
    blackPoint === 0 &&
    warmth === 0 &&
    tint === 0;


  // Sincroniza sliders com a imagem selecionada (se houver valor salvo no objeto)
  useEffect(() => {
    if (!visible) return;
    if (!levelsOpen) return;
    const current = editor?.current?.getActiveImageAdjustments?.();
    if (!current) return;
    setBrightness(current.brightness ?? 100);
    setContrast(current.contrast ?? 100);
    setSaturation(current.saturation ?? 100);
    setSepia(current.sepia ?? 0);
    setGrayscale(current.grayscale ?? 0);
    setHue(current.hue ?? 0);
    setSharpness(current.sharpness ?? 0);
    setDefinition(current.definition ?? 0);
    setHighlights(current.highlights ?? 0);
    setShadows(current.shadows ?? 0);
    setBlackPoint(current.blackPoint ?? 0);
    setWarmth(current.warmth ?? 0);
    setTint(current.tint ?? 0);

    // ao abrir, recalcula overflow e posição
    requestAnimationFrame(() => updateLevelsScrollState());
  }, [levelsOpen, visible, editor]);

  useEffect(() => {
    if (!levelsOpen) return;
    const onResize = () => updateLevelsScrollState();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [levelsOpen]);

  // Aplica com debounce (para não re-renderizar a cada pixel de slider)
  // Aplica com throttle (para atualizar durante o arraste sem travar)
  const applyTimerRef = useRef<number | null>(null);
  const applyPendingRef = useRef<ImageAdjustments | null>(null);
  useEffect(() => {
    if (!visible) return;
    // Importante: não aplicar níveis quando o menu está fechado,
    // senão ao re-selecionar a imagem o componente remonta e resetaria para o original.
    if (!levelsOpen) return;
    if (!editor?.current?.applyActiveImageAdjustments) return;

    // Evita trabalho desnecessário: só aplica o default se a imagem
    // realmente está com ajustes diferentes (reset intencional).
    if (levelsIsDefault) {
      const current = editor?.current?.getActiveImageAdjustments?.();
      const currentIsDefault =
        !current ||
        (
          (current.brightness ?? 100) === 100 &&
          (current.contrast ?? 100) === 100 &&
          (current.saturation ?? 100) === 100 &&
          (current.sepia ?? 0) === 0 &&
          (current.grayscale ?? 0) === 0 &&
          (current.hue ?? 0) === 0 &&
          (current.sharpness ?? 0) === 0 &&
          (current.definition ?? 0) === 0 &&
          (current.highlights ?? 0) === 0 &&
          (current.shadows ?? 0) === 0 &&
          (current.blackPoint ?? 0) === 0 &&
          (current.warmth ?? 0) === 0 &&
          (current.tint ?? 0) === 0 &&
          !(current.shadowOn ?? false) &&
          (current.shadowBlur ?? 0) === 0 &&
          (current.shadowOpacity ?? 0) === 0
        );
      if (currentIsDefault) return;
    }

    applyPendingRef.current = getAdj();

    // Se já existe um timer rodando, ele vai aplicar o último valor pendente.
    if (applyTimerRef.current) return;

    // Intervalo curto o suficiente para parecer “ao vivo”, mas sem disparar encode a cada evento.
    applyTimerRef.current = window.setTimeout(() => {
      applyTimerRef.current = null;
      const next = applyPendingRef.current;
      applyPendingRef.current = null;
      if (!next) return;
      void editor.current?.applyActiveImageAdjustments?.(next);
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    brightness,
    contrast,
    saturation,
    sepia,
    grayscale,
    hue,
    sharpness,
    definition,
    highlights,
    shadows,
    blackPoint,
    warmth,
    tint,
    visible,
    levelsOpen,
    levelsIsDefault,
  ]);

  useEffect(() => {
    if (visible && levelsOpen) return;
    if (applyTimerRef.current) {
      window.clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
    applyPendingRef.current = null;
  }, [visible, levelsOpen]);

  useEffect(() => {
    if (!levelsPinned) return;
    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (levelsAreaRef.current && levelsAreaRef.current.contains(target)) return;
      setLevelsPinned(false);
      setLevelsOpen(false);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      setLevelsPinned(false);
      setLevelsOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [levelsPinned]);

  const cropAreaRef = useRef<HTMLDivElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropPinned, setCropPinned] = useState(false);
  const cropCloseTimerRef = useRef<number | null>(null);

  const [cropTool, setCropTool] = useState<CropTool>("default");

  const cropToolMeta: Record<
    CropTool,
    { label: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    default: { label: "Corte", Icon: Scissors },
    square: { label: "Corte quadrado", Icon: Crop },
    lasso: { label: "Laço", Icon: Lasso },
    magic: { label: "Varinha mágica", Icon: Wand2 },
    color: { label: "Por cor", Icon: Pipette },
  };

  const selectCropTool = (next: CropTool) => {
    setCropTool(next);
    setCropPinned(false);
    setCropOpen(false);

    // Corte: entra em modo de preview no Fabric.
    if (next === "square") {
      try {
        editor?.current?.startSquareCrop?.();
      } catch {}
      return;
    }

    if (next === "lasso") {
      try {
        editor?.current?.startLassoCrop?.();
      } catch {}
      return;
    } else {
      try {
        editor?.current?.cancelCrop?.();
      } catch {}
    }

    if (next === "color") {
      try {
        editor?.current?.startColorCut?.();
      } catch {}
      return;
    }
  };

  const cancelCropClose = () => {
    if (cropCloseTimerRef.current) {
      window.clearTimeout(cropCloseTimerRef.current);
      cropCloseTimerRef.current = null;
    }
  };

  const scheduleCropClose = (delayMs = 180) => {
    cancelCropClose();
    cropCloseTimerRef.current = window.setTimeout(() => {
      cropCloseTimerRef.current = null;
      if (!cropPinned) setCropOpen(false);
    }, delayMs);
  };

  useEffect(() => {
    if (!cropPinned) return;

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (cropAreaRef.current && cropAreaRef.current.contains(target)) return;
      setCropPinned(false);
      setCropOpen(false);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      setCropPinned(false);
      setCropOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cropPinned]);

  useEffect(() => {
    return () => cancelCropClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toolbar = (
    <div
      className="relative flex items-center gap-2 p-2"
      role="toolbar"
      aria-label="Ferramentas de imagem"
    >
      <div ref={levelsAreaRef} className="contents">
        <button
          type="button"
          title="Níveis"
          aria-label="Níveis"
          className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
          onMouseEnter={() => {
            cancelLevelsClose();
            if (!levelsPinned) setLevelsOpen(true);
          }}
          onMouseLeave={() => {
            if (!levelsPinned) scheduleLevelsClose(LEVELS_CLOSE_DELAY_MS);
          }}
          onClick={() => {
            setLevelsPinned(true);
            setLevelsOpen(true);
          }}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>

        {levelsOpen && (
          <div
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30"
            onMouseEnter={() => {
              cancelLevelsClose();
              if (!levelsPinned) setLevelsOpen(true);
            }}
            onMouseLeave={() => {
              if (!levelsPinned) scheduleLevelsClose(LEVELS_CLOSE_DELAY_MS);
            }}
          >
            <div className="w-[760px] max-w-[95vw]">
              <div className="relative">
                <div
                  ref={levelsScrollRef}
                  style={{
                    WebkitMaskImage: getLevelsMask(),
                    maskImage: getLevelsMask(),
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "100% 100%",
                    maskSize: "100% 100%",
                  }}
                  className={[
                    "flex items-stretch gap-3 overflow-x-auto pb-2",
                    "[scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.25)_transparent] dark:[scrollbar-color:rgba(255,255,255,0.20)_transparent]",
                    "[&::-webkit-scrollbar]:h-2",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:bg-black/20",
                    "dark:[&::-webkit-scrollbar-thumb]:bg-white/20",
                  ].join(" ")}
                  onScroll={updateLevelsScrollState}
                >
                {/* Luz / Tons (mais usados) */}
                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Sun className="h-7 w-7" />
                    <div className="text-xs opacity-80">Brilho</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "brightness"}
                        leftPercent={tipLeftPercent(brightness, 0, 200)}
                        text={`${brightness}%`}
                      />
                      <Slider
                        value={[brightness]}
                        min={0}
                        max={200}
                        step={1}
                        onValueChange={(v) => setBrightness(v[0] ?? 100)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("brightness");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Contrast className="h-7 w-7" />
                    <div className="text-xs opacity-80">Contraste</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "contrast"}
                        leftPercent={tipLeftPercent(contrast, 0, 200)}
                        text={`${contrast}%`}
                      />
                      <Slider
                        value={[contrast]}
                        min={0}
                        max={200}
                        step={1}
                        onValueChange={(v) => setContrast(v[0] ?? 100)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("contrast");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Sun className="h-7 w-7" />
                    <div className="text-xs opacity-80">Altas-luzes</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "highlights"}
                        leftPercent={tipLeftPercent(highlights, -100, 100)}
                        text={`${highlights > 0 ? "+" : ""}${highlights}`}
                      />
                      <Slider
                        value={[highlights]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={(v) => setHighlights(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("highlights");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <CircleDot className="h-7 w-7" />
                    <div className="text-xs opacity-80">Sombras</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "shadows"}
                        leftPercent={tipLeftPercent(shadows, -100, 100)}
                        text={`${shadows > 0 ? "+" : ""}${shadows}`}
                      />
                      <Slider
                        value={[shadows]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={(v) => setShadows(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("shadows");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <CircleDot className="h-7 w-7" />
                    <div className="text-xs opacity-80">Ponto preto</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "blackPoint"}
                        leftPercent={tipLeftPercent(blackPoint, -100, 100)}
                        text={`${blackPoint > 0 ? "+" : ""}${blackPoint}`}
                      />
                      <Slider
                        value={[blackPoint]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={(v) => setBlackPoint(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("blackPoint");
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Cor */}
                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Droplets className="h-7 w-7" />
                    <div className="text-xs opacity-80">Saturação</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "saturation"}
                        leftPercent={tipLeftPercent(saturation, 0, 200)}
                        text={`${saturation}%`}
                      />
                      <Slider
                        value={[saturation]}
                        min={0}
                        max={200}
                        step={1}
                        onValueChange={(v) => setSaturation(v[0] ?? 100)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("saturation");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Palette className="h-7 w-7" />
                    <div className="text-xs opacity-80">Calidez</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "warmth"}
                        leftPercent={tipLeftPercent(warmth, -100, 100)}
                        text={`${warmth > 0 ? "+" : ""}${warmth}`}
                      />
                      <Slider
                        value={[warmth]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={(v) => setWarmth(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("warmth");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Palette className="h-7 w-7" />
                    <div className="text-xs opacity-80">Tonalidade</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "tint"}
                        leftPercent={tipLeftPercent(tint, -100, 100)}
                        text={`${tint > 0 ? "+" : ""}${tint}`}
                      />
                      <Slider
                        value={[tint]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={(v) => setTint(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("tint");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Wand2 className="h-7 w-7" />
                    <div className="text-xs opacity-80">Matiz</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "hue"}
                        leftPercent={tipLeftPercent(hue, 0, 360)}
                        text={`${hue}°`}
                      />
                      <Slider
                        value={[hue]}
                        min={0}
                        max={360}
                        step={1}
                        onValueChange={(v) => setHue(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("hue");
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Detalhe */}
                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Contrast className="h-7 w-7" />
                    <div className="text-xs opacity-80">Definição</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "definition"}
                        leftPercent={tipLeftPercent(definition, -100, 100)}
                        text={`${definition > 0 ? "+" : ""}${definition}`}
                      />
                      <Slider
                        value={[definition]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={(v) => setDefinition(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("definition");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Sparkles className="h-7 w-7" />
                    <div className="text-xs opacity-80">Nitidez</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "sharpness"}
                        leftPercent={tipLeftPercent(sharpness, 0, 100)}
                        text={`${sharpness}`}
                      />
                      <Slider
                        value={[sharpness]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(v) => setSharpness(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("sharpness");
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Estilização */}
                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <CircleDot className="h-7 w-7" />
                    <div className="text-xs opacity-80">Cinza</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "grayscale"}
                        leftPercent={tipLeftPercent(grayscale, 0, 100)}
                        text={`${grayscale}%`}
                      />
                      <Slider
                        value={[grayscale]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(v) => setGrayscale(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("grayscale");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-[180px] rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 px-3 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <Palette className="h-7 w-7" />
                    <div className="text-xs opacity-80">Sépia</div>
                    <div className="w-full relative">
                      <Tip
                        show={activeSliderTip === "sepia"}
                        leftPercent={tipLeftPercent(sepia, 0, 100)}
                        text={`${sepia}%`}
                      />
                      <Slider
                        value={[sepia]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(v) => setSepia(v[0] ?? 0)}
                        onPointerDownCapture={(ev) => {
                          const t = ev.target as HTMLElement | null;
                          if (t?.getAttribute("role") === "slider") setActiveSliderTip("sepia");
                        }}
                      />
                    </div>
                  </div>
                </div>
                </div>

                {/* Setas flutuantes */}
                <button
                  type="button"
                  aria-label="Rolar para a esquerda"
                  className={[
                    "absolute left-1 top-1/2 -translate-y-1/2 z-10",
                    "h-8 w-8 grid place-items-center rounded-full border border-black/10 dark:border-white/10",
                    "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70",
                    "shadow-sm transition",
                    canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none",
                  ].join(" ")}
                  onClick={() => {
                    const el = levelsScrollRef.current;
                    if (!el) return;
                    el.scrollBy({ left: -260, behavior: "smooth" });
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  aria-label="Rolar para a direita"
                  className={[
                    "absolute right-1 top-1/2 -translate-y-1/2 z-10",
                    "h-8 w-8 grid place-items-center rounded-full border border-black/10 dark:border-white/10",
                    "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70",
                    "shadow-sm transition",
                    canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none",
                  ].join(" ")}
                  onClick={() => {
                    const el = levelsScrollRef.current;
                    if (!el) return;
                    el.scrollBy({ left: 260, behavior: "smooth" });
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={cropAreaRef}
        className="contents"
      >
        <button
          type="button"
          title={cropToolMeta[cropTool].label}
          aria-label={cropToolMeta[cropTool].label}
          className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
          onMouseEnter={() => {
            cancelCropClose();
            if (!cropPinned) setCropOpen(true);
          }}
          onMouseLeave={() => {
            if (!cropPinned) scheduleCropClose();
          }}
          onClick={() => {
            setCropPinned(true);
            setCropOpen(true);
          }}
        >
          <span className="grid place-items-center">
            {/** key força re-mount e anima quando trocar */}
            {(() => {
              const Icon = cropToolMeta[cropTool].Icon;
              return (
                <Icon
                  key={cropTool}
                  className="h-4 w-4 animate-in fade-in zoom-in-95 duration-250"
                />
              );
            })()}
          </span>
        </button>

        {cropOpen && (
          <div
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30"
            onMouseEnter={() => {
              cancelCropClose();
              if (!cropPinned) setCropOpen(true);
            }}
            onMouseLeave={() => {
              if (!cropPinned) scheduleCropClose();
            }}
          >
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 p-2 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Corte quadrado"
                  aria-label="Corte quadrado"
                  className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
                  onClick={() => selectCropTool("square")}
                >
                  <Crop className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  title="Laço"
                  aria-label="Laço"
                  className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
                  onClick={() => selectCropTool("lasso")}
                >
                  <Lasso className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  title="Varinha mágica"
                  aria-label="Varinha mágica"
                  className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
                  onClick={() => selectCropTool("magic")}
                >
                  <Wand2 className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  title="Por cor"
                  aria-label="Por cor"
                  className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
                  onClick={() => selectCropTool("color")}
                >
                  <Pipette className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botão Efeitos com menu horizontal */}
      <div
        ref={effectsAreaRef}
        className="relative"
        onMouseEnter={() => {
          cancelEffectsClose();
          setEffectsOpen(true);
        }}
        onMouseLeave={() => scheduleEffectsClose(520)}
      >
        <button
          type="button"
          title="Efeitos"
          aria-label="Efeitos"
          className={`h-9 w-9 grid place-items-center rounded-xl border transition ${
            effectsOpen || effectKind !== "none"
              ? "border-violet-400 bg-violet-50 dark:bg-violet-900/30 shadow"
              : "border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow"
          }`}
          onClick={() => {
            setEffectsOpen((v) => !v);
            setEffectsPinned((p) => !p);
          }}
        >
          <Sparkles className="h-4 w-4" />
        </button>

        {effectsOpen && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50"
            onMouseEnter={cancelEffectsClose}
            onMouseLeave={() => scheduleEffectsClose(520)}
          >
            <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-xl shadow-xl border border-black/10 dark:border-white/10 p-3">
              {/* Header com título e toggle bucket/brush/lasso */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-xs font-medium text-muted-foreground">Efeitos</div>
                <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-lg p-0.5">
                  <button
                    type="button"
                    title="Balde (aplicar em toda imagem)"
                    className={`h-7 w-7 grid place-items-center rounded-md transition ${
                      effectMode === "bucket"
                        ? "bg-white dark:bg-neutral-800 shadow-sm"
                        : "hover:bg-white/50 dark:hover:bg-white/10"
                    }`}
                    onClick={() => {
                      setEffectMode("bucket");
                      // Cancela o modo brush se estiver ativo
                      editor?.current?.cancelEffectBrush?.();
                      editor?.current?.cancelEffectLasso?.();
                      if (effectKind !== "none") applyEffect(effectKind, effectAmount);
                    }}
                  >
                    <PaintBucket className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Pincel (aplicar por área)"
                    className={`h-7 w-7 grid place-items-center rounded-md transition ${
                      effectMode === "brush"
                        ? "bg-white dark:bg-neutral-800 shadow-sm"
                        : "hover:bg-white/50 dark:hover:bg-white/10"
                    }`}
                    onClick={() => {
                      setEffectMode("brush");
                      // Não entra em edição aqui: entra quando selecionar um efeito.
                      editor?.current?.cancelEffectLasso?.();
                    }}
                  >
                    <Paintbrush className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    title="Laço (aplicar por área)"
                    className={`h-7 w-7 grid place-items-center rounded-md transition ${
                      effectMode === "lasso"
                        ? "bg-white dark:bg-neutral-800 shadow-sm"
                        : "hover:bg-white/50 dark:hover:bg-white/10"
                    }`}
                    onClick={() => {
                      setEffectMode("lasso");
                      // Não entra em edição aqui: entra quando selecionar um efeito.
                      editor?.current?.cancelEffectBrush?.();
                    }}
                  >
                    <Lasso className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Categorias de efeitos */}
              <div className="mt-2 px-1 flex flex-wrap gap-1">
                {EFFECT_LIBRARY.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`px-3 h-7 rounded-full text-xs border transition ${
                      effectCategory === cat.id
                        ? "border-violet-400 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200"
                        : "border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 hover:bg-white dark:hover:bg-neutral-800"
                    }`}
                    onClick={() => {
                      setEffectCategory(cat.id);
                      const hasCurrent = cat.presets.some((p) => p.kind === effectKind) || effectKind === "none";
                      if (!hasCurrent && cat.presets.length > 0) {
                        handleEffectKindChange(cat.presets[0].kind);
                      }
                      requestAnimationFrame(updateEffectsScrollState);
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Container horizontal com scroll */}
              <div className="relative">
                {/* Seta esquerda */}
                {canScrollEffectsLeft && (
                  <button
                    type="button"
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 grid place-items-center rounded-full bg-white/90 dark:bg-neutral-800/90 shadow border border-black/10 dark:border-white/10"
                    onClick={() => {
                      const el = effectsScrollRef.current;
                      if (el) {
                        el.scrollBy({ left: -160, behavior: "smooth" });
                        setTimeout(updateEffectsScrollState, 200);
                      }
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                {/* Seta direita */}
                {canScrollEffectsRight && (
                  <button
                    type="button"
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 grid place-items-center rounded-full bg-white/90 dark:bg-neutral-800/90 shadow border border-black/10 dark:border-white/10"
                    onClick={() => {
                      const el = effectsScrollRef.current;
                      if (el) {
                        el.scrollBy({ left: 160, behavior: "smooth" });
                        setTimeout(updateEffectsScrollState, 200);
                      }
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}

                {/* Scroll horizontal de presets */}
                <div
                  ref={effectsScrollRef}
                  className="flex gap-2 overflow-x-auto scrollbar-hide px-1 py-1"
                  style={{
                    maskImage: getEffectsMask(),
                    WebkitMaskImage: getEffectsMask(),
                    maxWidth: "min(600px, 80vw)",
                  }}
                  onScroll={updateEffectsScrollState}
                  onLoad={() => requestAnimationFrame(updateEffectsScrollState)}
                >
                  {visibleEffectPresets.map((preset) => (
                    <button
                      key={preset.kind}
                      type="button"
                      title={preset.label}
                      className={`shrink-0 flex flex-col items-center justify-center gap-1 w-[72px] py-2 rounded-xl border transition ${
                        effectKind === preset.kind
                          ? "border-violet-400 bg-violet-50 dark:bg-violet-900/30 ring-1 ring-violet-400"
                          : "border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 hover:bg-white dark:hover:bg-neutral-800"
                      }`}
                      onClick={() => handleEffectKindChange(preset.kind)}
                    >
                      <span className="text-xl">{preset.icon}</span>
                      <span className="text-[10px] text-muted-foreground">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slider de intensidade */}
              {effectKind !== "none" && (
                <div className="mt-3 px-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <Sparkles className="h-4 w-4 opacity-60" />
                      <span className="text-xs text-muted-foreground">Intensidade</span>
                    </div>
                    <div className="flex-1 relative">
                      <Tip
                        show={activeSliderTip === "effectAmount"}
                        leftPercent={effectAmount}
                        text={`${effectAmount}%`}
                      />
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[effectAmount]}
                        onValueChange={([val]) => handleEffectAmountChange(val)}
                        onPointerDownCapture={() => setActiveSliderTip("effectAmount")}
                        className="w-full"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{effectAmount}%</span>
                  </div>
                </div>
              )}

              {/* Slider de tamanho do pincel (apenas no modo brush) */}
              {effectMode === "brush" && (
                <div className="mt-3 px-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <Paintbrush className="h-4 w-4 opacity-60" />
                      <span className="text-xs text-muted-foreground">Tamanho</span>
                    </div>
                    <div className="flex-1 relative">
                      <Tip
                        show={activeSliderTip === "effectBrushSize"}
                        leftPercent={tipLeftPercent(effectBrushSize, 5, 200)}
                        text={`${effectBrushSize}px`}
                      />
                      <Slider
                        min={5}
                        max={200}
                        step={1}
                        value={[effectBrushSize]}
                        onValueChange={([val]) => setEffectBrushSize(val)}
                        onPointerDownCapture={() => setActiveSliderTip("effectBrushSize")}
                        className="w-full"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{effectBrushSize}px</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Separador visual */}
      <div className="mx-2 h-8 w-px bg-black/20 dark:bg-white/20 opacity-60" />

      <IconBtn title="Transformação unificada">
        <Move className="h-4 w-4" />
      </IconBtn>

      {/* Separador visual */}
      <div className="mx-2 h-8 w-px bg-black/20 dark:bg-white/20 opacity-60" />

      <IconBtn title="Deformação">
        <Waves className="h-4 w-4" />
      </IconBtn>
    </div>
  );

  if (position === "top") {
    return <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[60]">{toolbar}</div>;
  }
  if (position === "bottom") {
    return (
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60]" style={{ maxWidth: "95%" }}>
        {toolbar}
      </div>
    );
  }
  return toolbar;
}
