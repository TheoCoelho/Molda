// src/components/ImageToolbar.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Crop,
  Lasso,
  SlidersHorizontal,
  Sparkles,
  Square,
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
} from "lucide-react";
import type { Editor2DHandle, ImageAdjustments } from "../components/Editor2D";
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
      className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
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

  const [activeSliderTip, setActiveSliderTip] = useState<
    null | "brightness" | "contrast" | "saturation" | "sepia" | "grayscale" | "hue"
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
    hue === 0;


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
  const applyTimerRef = useRef<number | null>(null);
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
          !(current.shadowOn ?? false) &&
          (current.shadowBlur ?? 0) === 0 &&
          (current.shadowOpacity ?? 0) === 0
        );
      if (currentIsDefault) return;
    }
    if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);
    const next = getAdj();
    applyTimerRef.current = window.setTimeout(() => {
      applyTimerRef.current = null;
      void editor.current?.applyActiveImageAdjustments?.(next);
    }, 80);
    return () => {
      if (applyTimerRef.current) {
        window.clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brightness, contrast, saturation, sepia, grayscale, hue, visible, levelsOpen, levelsIsDefault]);

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
    default: { label: "Corte", Icon: Crop },
    square: { label: "Corte quadrado", Icon: Square },
    lasso: { label: "Laço", Icon: Lasso },
    magic: { label: "Varinha mágica", Icon: Wand2 },
    color: { label: "Por cor", Icon: Pipette },
  };

  const selectCropTool = (next: CropTool) => {
    setCropTool(next);
    setCropPinned(false);
    setCropOpen(false);
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
      className={[
        "relative",
        "flex items-center gap-2 p-2 rounded-2xl border shadow-lg bg-background",
        "backdrop-blur supports-[backdrop-filter]:bg-background/90",
      ].join(" ")}
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
                  <Square className="h-4 w-4" />
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

      <IconBtn title="Efeitos">
        <Sparkles className="h-4 w-4" />
      </IconBtn>

      <IconBtn title="Transformação unificada">
        <Move className="h-4 w-4" />
      </IconBtn>

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
