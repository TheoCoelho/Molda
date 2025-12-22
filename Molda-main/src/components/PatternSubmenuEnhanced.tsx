import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

import type { PatternCategory, PatternDefinition } from "../lib/patterns";
import { PATTERN_LIBRARY } from "../lib/patterns";
import {
  CSS_PATTERN_LIBRARY,
  CSS_PATTERN_CATEGORY_LABELS,
  generatePatternDataUrl,
  type CSSPatternDefinition,
  type CSSPatternParams,
} from "../lib/css-patterns";
import { ScrollArea } from "./ui/scroll-area";
import { Slider } from "./ui/slider";
import { cn } from "../lib/utils";
import { ChevronLeft, Palette, RotateCcw, Settings2 } from "lucide-react";

const CATEGORY_LABELS: Record<PatternCategory, string> = {
  animals: "Animais",
  geometric: "Geométrico",
  abstract: "Abstrato",
  floral: "Floral",
  custom: "Personalizado",
};

export interface PatternSubmenuProps {
  onSelectPattern: (pattern: PatternDefinition) => void;
  onPreviewStart?: (pattern: PatternDefinition) => void;
  onPreviewEnd?: () => void;
}

type ViewMode = "gallery" | "customize";
type PatternTab = "image" | "css";

export function PatternSubmenu({
  onSelectPattern,
  onPreviewStart,
  onPreviewEnd,
}: PatternSubmenuProps) {
  const [activeTab, setActiveTab] = useState<PatternTab>("css");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [selectedCSSPattern, setSelectedCSSPattern] = useState<CSSPatternDefinition | null>(null);
  const [customParams, setCustomParams] = useState<CSSPatternParams | null>(null);

  // Cache de thumbnails para padrões CSS
  const [cssThumbnails, setCssThumbnails] = useState<Record<string, string>>({});

  // Gerar thumbnails para padrões CSS de forma assíncrona
  useEffect(() => {
    let cancelled = false;
    const thumbnails: Record<string, string> = {};
    
    // Gera thumbnails em batches para não travar a UI
    const generateBatch = async (startIndex: number) => {
      const batchSize = 4;
      const endIndex = Math.min(startIndex + batchSize, CSS_PATTERN_LIBRARY.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        if (cancelled) return;
        const pattern = CSS_PATTERN_LIBRARY[i];
        thumbnails[pattern.id] = generatePatternDataUrl(pattern, { size: 50 });
      }
      
      if (!cancelled) {
        setCssThumbnails({ ...thumbnails });
        
        if (endIndex < CSS_PATTERN_LIBRARY.length) {
          // Aguarda um frame antes de processar o próximo batch
          requestAnimationFrame(() => generateBatch(endIndex));
        }
      }
    };
    
    generateBatch(0);
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Agrupa padrões de imagem por categoria
  const patternsByCategory = useMemo(() => {
    const grouped: Record<PatternCategory, PatternDefinition[]> = {
      animals: [],
      geometric: [],
      abstract: [],
      floral: [],
      custom: [],
    };
    for (const pattern of PATTERN_LIBRARY) {
      grouped[pattern.category].push(pattern);
    }
    return grouped;
  }, []);

  // Agrupa padrões CSS por categoria
  const cssPatternsByCategory = useMemo(() => {
    const grouped: Record<CSSPatternDefinition["category"], CSSPatternDefinition[]> = {
      waves: [],
      stripes: [],
      geometric: [],
      checker: [],
      dots: [],
      gradient: [],
      "3d": [],
    };
    for (const pattern of CSS_PATTERN_LIBRARY) {
      if (grouped[pattern.category]) {
        grouped[pattern.category].push(pattern);
      }
    }
    return grouped;
  }, []);

  // Quando seleciona um padrão CSS para customizar
  const handleCSSPatternSelect = useCallback((pattern: CSSPatternDefinition) => {
    setSelectedCSSPattern(pattern);
    setCustomParams({ ...pattern.defaultParams });
    setViewMode("customize");
  }, []);

  // Quando aplica o padrão CSS customizado
  const handleApplyCSSPattern = useCallback(() => {
    if (!selectedCSSPattern || !customParams) return;

    // Gera a imagem do padrão com os parâmetros customizados (tamanho fixo para performance)
    const renderSize = Math.min(customParams.size, 150); // Limita tamanho máximo
    const dataUrl = generatePatternDataUrl(selectedCSSPattern, { ...customParams, size: renderSize });

    // Converte para PatternDefinition para manter compatibilidade
    // Scale relativo ao tamanho renderizado
    const patternDef: PatternDefinition = {
      id: `css-custom-${selectedCSSPattern.id}-${Date.now()}`,
      name: selectedCSSPattern.name,
      category: "custom",
      source: dataUrl,
      thumbnail: dataUrl,
      repeat: "repeat",
      defaultScale: 0.5, // Escala fixa para melhor performance
    };

    onSelectPattern(patternDef);
    setViewMode("gallery");
  }, [selectedCSSPattern, customParams, onSelectPattern]);

  // Reseta para os parâmetros padrão
  const handleResetParams = useCallback(() => {
    if (selectedCSSPattern) {
      setCustomParams({ ...selectedCSSPattern.defaultParams });
    }
  }, [selectedCSSPattern]);

  // Volta para a galeria
  const handleBackToGallery = useCallback(() => {
    setViewMode("gallery");
    onPreviewEnd?.();
  }, [onPreviewEnd]);

  if (viewMode === "customize" && selectedCSSPattern && customParams) {
    return (
      <CSSPatternCustomizer
        pattern={selectedCSSPattern}
        params={customParams}
        onParamsChange={setCustomParams}
        onApply={handleApplyCSSPattern}
        onReset={handleResetParams}
        onBack={handleBackToGallery}
        onPreviewEnd={onPreviewEnd}
      />
    );
  }

  return (
    <div className="w-80">
      {/* Tabs */}
      <div className="flex border-b border-border mb-2">
        <button
          type="button"
          onClick={() => setActiveTab("css")}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "css"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Palette className="w-4 h-4 inline mr-1" />
          Padrões CSS
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("image")}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "image"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Texturas
        </button>
      </div>

      <ScrollArea className="h-80 p-2">
        {activeTab === "css" ? (
          <div className="space-y-4">
            {(Object.keys(cssPatternsByCategory) as CSSPatternDefinition["category"][]).map(
              (category) => {
                const patterns = cssPatternsByCategory[category];
                if (!patterns.length) return null;
                return (
                  <CSSCategorySection
                    key={category}
                    label={CSS_PATTERN_CATEGORY_LABELS[category]}
                    patterns={patterns}
                    thumbnails={cssThumbnails}
                    onSelectPattern={handleCSSPatternSelect}
                  />
                );
              }
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(Object.keys(patternsByCategory) as PatternCategory[]).map((category) => {
              const patterns = patternsByCategory[category];
              if (!patterns.length) return null;
              return (
                <ImageCategorySection
                  key={category}
                  label={CATEGORY_LABELS[category]}
                  patterns={patterns}
                  onSelectPattern={onSelectPattern}
                  onPreviewStart={onPreviewStart}
                  onPreviewEnd={onPreviewEnd}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Seção de categoria para padrões CSS
// =============================================================================

function CSSCategorySection({
  label,
  patterns,
  thumbnails,
  onSelectPattern,
}: {
  label: string;
  patterns: CSSPatternDefinition[];
  thumbnails: Record<string, string>;
  onSelectPattern: (pattern: CSSPatternDefinition) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-muted-foreground flex items-center gap-1">
        {label}
        <Settings2 className="w-3 h-3 opacity-50" />
      </h4>
      <div className="grid grid-cols-4 gap-2">
        {patterns.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            onClick={() => onSelectPattern(pattern)}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-md",
              "border-2 border-transparent hover:border-primary",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              "group"
            )}
            title={`${pattern.name} (clique para personalizar)`}
          >
            {thumbnails[pattern.id] ? (
              <img
                src={thumbnails[pattern.id]}
                alt={pattern.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-muted animate-pulse" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
              <Settings2 className="w-4 h-4 text-white" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Seção de categoria para padrões de imagem/textura
// =============================================================================

function ImageCategorySection({
  label,
  patterns,
  onSelectPattern,
  onPreviewStart,
  onPreviewEnd,
}: {
  label: string;
  patterns: PatternDefinition[];
  onSelectPattern: (pattern: PatternDefinition) => void;
  onPreviewStart?: (pattern: PatternDefinition) => void;
  onPreviewEnd?: () => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">{label}</h4>
      <div className="grid grid-cols-4 gap-2">
        {patterns.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            onClick={() => onSelectPattern(pattern)}
            onMouseEnter={() => onPreviewStart?.(pattern)}
            onMouseLeave={() => onPreviewEnd?.()}
            onFocus={() => onPreviewStart?.(pattern)}
            onBlur={() => onPreviewEnd?.()}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-md",
              "border-2 border-transparent hover:border-primary",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            )}
            title={pattern.name}
          >
            <img
              src={pattern.thumbnail}
              alt={pattern.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-xs text-white font-medium">{pattern.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Customizador de padrões CSS
// =============================================================================

interface CSSPatternCustomizerProps {
  pattern: CSSPatternDefinition;
  params: CSSPatternParams;
  onParamsChange: (params: CSSPatternParams) => void;
  onApply: () => void;
  onReset: () => void;
  onBack: () => void;
  onPreviewEnd?: () => void;
}

function CSSPatternCustomizer({
  pattern,
  params,
  onParamsChange,
  onApply,
  onReset,
  onBack,
  onPreviewEnd,
}: CSSPatternCustomizerProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Atualiza preview quando params mudam (com debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Limita o tamanho para melhor performance
      const renderSize = Math.min(params.size, 100);
      const url = generatePatternDataUrl(pattern, { ...params, size: renderSize });
      setPreviewUrl(url);
    }, 50);
    return () => clearTimeout(timer);
  }, [pattern, params]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      onPreviewEnd?.();
    };
  }, [onPreviewEnd]);

  const updateParam = <K extends keyof CSSPatternParams>(key: K, value: CSSPatternParams[K]) => {
    onParamsChange({ ...params, [key]: value });
  };

  const hasRotation = pattern.category === "stripes" || pattern.category === "gradient";
  const hasLineWidth =
    pattern.category === "stripes" ||
    pattern.category === "dots" ||
    pattern.id.includes("zigzag") ||
    pattern.id.includes("crosshatch") ||
    pattern.id.includes("grid");

  return (
    <div className="w-80 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-1 hover:bg-muted rounded-md transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="font-medium flex-1">{pattern.name}</h3>
        <button
          type="button"
          onClick={onReset}
          className="p-1 hover:bg-muted rounded-md transition-colors"
          title="Restaurar padrão"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Preview */}
      <div
        ref={previewRef}
        className="w-full aspect-square rounded-lg border border-border mb-4 overflow-hidden"
        style={{
          backgroundImage: `url(${previewUrl})`,
          backgroundRepeat: "repeat",
          backgroundSize: `${params.size}px ${params.size}px`,
        }}
      />

      {/* Controles */}
      <div className="space-y-4">
        {/* Cores */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Cores</label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Cor 1</label>
              <div className="relative">
                <input
                  type="color"
                  value={params.color1}
                  onChange={(e) => updateParam("color1", e.target.value)}
                  className="w-full h-10 rounded-md cursor-pointer border border-border"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Cor 2</label>
              <div className="relative">
                <input
                  type="color"
                  value={params.color2}
                  onChange={(e) => updateParam("color2", e.target.value)}
                  className="w-full h-10 rounded-md cursor-pointer border border-border"
                />
              </div>
            </div>
            {/* Botão para trocar cores */}
            <button
              type="button"
              onClick={() => {
                const temp = params.color1;
                updateParam("color1", params.color2);
                setTimeout(() => updateParam("color2", temp), 0);
              }}
              className="self-end p-2 hover:bg-muted rounded-md transition-colors mb-0.5"
              title="Trocar cores"
            >
              ⇄
            </button>
          </div>
        </div>

        {/* Tamanho */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Tamanho</label>
            <span className="text-xs text-muted-foreground">{params.size}px</span>
          </div>
          <Slider
            value={[params.size]}
            onValueChange={([value]) => updateParam("size", value)}
            min={20}
            max={200}
            step={5}
          />
        </div>

        {/* Rotação (para padrões que suportam) */}
        {hasRotation && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">Rotação</label>
              <span className="text-xs text-muted-foreground">{params.rotation ?? 0}°</span>
            </div>
            <Slider
              value={[params.rotation ?? 0]}
              onValueChange={([value]) => updateParam("rotation", value)}
              min={0}
              max={360}
              step={15}
            />
          </div>
        )}

        {/* Espessura das linhas (para padrões que suportam) */}
        {hasLineWidth && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">Espessura</label>
              <span className="text-xs text-muted-foreground">
                {Math.round((params.lineWidth ?? 0.5) * 100)}%
              </span>
            </div>
            <Slider
              value={[(params.lineWidth ?? 0.5) * 100]}
              onValueChange={([value]) => updateParam("lineWidth", value / 100)}
              min={5}
              max={80}
              step={5}
            />
          </div>
        )}

        {/* Opacidade */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Opacidade</label>
            <span className="text-xs text-muted-foreground">
              {Math.round((params.opacity ?? 1) * 100)}%
            </span>
          </div>
          <Slider
            value={[(params.opacity ?? 1) * 100]}
            onValueChange={([value]) => updateParam("opacity", value / 100)}
            min={20}
            max={100}
            step={5}
          />
        </div>
      </div>

      {/* Botão Aplicar */}
      <button
        type="button"
        onClick={onApply}
        className={cn(
          "w-full mt-6 py-2.5 px-4 rounded-md font-medium",
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        )}
      >
        Aplicar Padrão
      </button>
    </div>
  );
}
