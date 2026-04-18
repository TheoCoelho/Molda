// src/components/ShapeEffectsPanel.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, Undo2, Redo2 } from "lucide-react";
import type { Editor2DHandle, ShapeEffectParams } from "./Editor2D";

// ──────────────────────────────────────────────────────────────────────────────
// Thumbnails dos efeitos (SVG inline para preview visual)
// ──────────────────────────────────────────────────────────────────────────────

function ThumbProjetada() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="16" width="28" height="28" rx="6" fill="rgba(0,0,0,0.3)" />
      <rect x="10" y="10" width="28" height="28" rx="6" fill="#7c3aed" />
    </svg>
  );
}

function ThumbBrilhante() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <filter id="glow-thumb">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="10" y="10" width="36" height="36" rx="7" fill="#7c3aed" filter="url(#glow-thumb)" opacity="0.6" />
      <rect x="10" y="10" width="36" height="36" rx="7" fill="#7c3aed" />
    </svg>
  );
}

function ThumbEco() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="18" y="18" width="28" height="28" rx="6" fill="#7c3aed" opacity="0.25" />
      <rect x="14" y="14" width="28" height="28" rx="6" fill="#7c3aed" opacity="0.5" />
      <rect x="10" y="10" width="28" height="28" rx="6" fill="#7c3aed" />
    </svg>
  );
}

function ThumbFalha() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="14" width="28" height="28" rx="6" fill="#ff00ff" opacity="0.7" />
      <rect x="16" y="16" width="28" height="28" rx="6" fill="#00ffff" opacity="0.7" />
      <rect x="11" y="11" width="28" height="28" rx="6" fill="#7c3aed" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Slider com label e botões +/–
// ──────────────────────────────────────────────────────────────────────────────

function EffectSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-violet-600 dark:text-violet-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 accent-violet-600 cursor-pointer"
          style={{ accentColor: "#7c3aed" }}
        />
        <button
          type="button"
          className="h-6 w-6 grid place-items-center rounded border border-black/10 dark:border-white/15 bg-white/70 dark:bg-neutral-800/70 text-sm hover:bg-white dark:hover:bg-neutral-700 transition shrink-0"
          onClick={() => onChange(clamp(value - step))}
          aria-label={`Diminuir ${label}`}
        >
          <X className="h-2.5 w-2.5 rotate-45" />
        </button>
        <span className="text-xs tabular-nums w-8 text-center">{value}</span>
        <button
          type="button"
          className="h-6 w-6 grid place-items-center rounded border border-black/10 dark:border-white/15 bg-white/70 dark:bg-neutral-800/70 text-sm hover:bg-white dark:hover:bg-neutral-700 transition shrink-0"
          onClick={() => onChange(clamp(value + step))}
          aria-label={`Aumentar ${label}`}
        >
          <span className="text-xs font-bold leading-none">+</span>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Color dot picker
// ──────────────────────────────────────────────────────────────────────────────

function ColorDot({ color, onChange, label }: { color: string; onChange: (c: string) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs">{label}</span>}
      <button
        type="button"
        className="h-7 w-7 rounded-full border-2 border-white dark:border-neutral-700 shadow-md transition hover:scale-110"
        style={{ backgroundColor: color }}
        onClick={() => inputRef.current?.click()}
        aria-label={`Cor ${label || ""}`}
        title={color}
      />
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-hidden="true"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_PROJETADA: Extract<ShapeEffectParams, { kind: "projetada" }> = {
  kind: "projetada",
  direction: -45,
  distance: 20,
  blur: 10,
  transparency: 30,
  color: "#000000",
};

const DEFAULT_BRILHANTE: Extract<ShapeEffectParams, { kind: "brilhante" }> = {
  kind: "brilhante",
  intensity: 40,
  color: "#000000",
};

const DEFAULT_ECO: Extract<ShapeEffectParams, { kind: "eco" }> = {
  kind: "eco",
  direction: -52,
  distance: 13,
  color: "#000000",
};

const DEFAULT_FALHA: Extract<ShapeEffectParams, { kind: "falha" }> = {
  kind: "falha",
  direction: -55,
  distance: 9,
  color1: "#ff00ff",
  color2: "#00ffff",
};

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────

type Props = {
  editor: { current: Editor2DHandle | undefined | null };
  visible?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClose?: () => void;
  /** Override da className do container externo (usado em modo sidebar) */
  className?: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────────────

export default function ShapeEffectsPanel({ editor, visible = true, onUndo, onRedo, canUndo, canRedo, onClose, className }: Props) {
  const [activeKind, setActiveKind] = useState<ShapeEffectParams["kind"] | "none">("none");

  // Per-effect param state
  const [projetada, setProjetada] = useState(DEFAULT_PROJETADA);
  const [brilhante, setBrilhante] = useState(DEFAULT_BRILHANTE);
  const [eco, setEco] = useState(DEFAULT_ECO);
  const [falha, setFalha] = useState(DEFAULT_FALHA);

  // Read current effect from the selected object when panel becomes visible
  useEffect(() => {
    if (!visible) return;
    const current = editor.current?.getActiveShapeEffect?.();
    if (current) {
      setActiveKind(current.kind);
      if (current.kind === "projetada") setProjetada(current);
      else if (current.kind === "brilhante") setBrilhante(current);
      else if (current.kind === "eco") setEco(current);
      else if (current.kind === "falha") setFalha(current);
    } else {
      setActiveKind("none");
    }
  }, [visible, editor]);

  // Apply the effect whenever params change
  const apply = useCallback(
    (effect: ShapeEffectParams) => {
      editor.current?.applyShapeEffect?.(effect);
    },
    [editor]
  );

  const updateProjetada = (patch: Partial<typeof projetada>) => {
    const next = { ...projetada, ...patch };
    setProjetada(next);
    apply(next);
  };

  const updateBrilhante = (patch: Partial<typeof brilhante>) => {
    const next = { ...brilhante, ...patch };
    setBrilhante(next);
    apply(next);
  };

  const updateEco = (patch: Partial<typeof eco>) => {
    const next = { ...eco, ...patch };
    setEco(next);
    apply(next);
  };

  const updateFalha = (patch: Partial<typeof falha>) => {
    const next = { ...falha, ...patch };
    setFalha(next);
    apply(next);
  };

  const selectKind = (kind: ShapeEffectParams["kind"]) => {
    setActiveKind(kind);
    if (kind === "projetada") apply(projetada);
    else if (kind === "brilhante") apply(brilhante);
    else if (kind === "eco") apply(eco);
    else if (kind === "falha") apply(falha);
  };

  const removeEffect = () => {
    setActiveKind("none");
    editor.current?.removeShapeEffect?.();
  };

  if (!visible) return null;

  const EFFECTS: { kind: ShapeEffectParams["kind"]; label: string; Thumb: React.FC }[] = [
    { kind: "projetada", label: "Projetada", Thumb: ThumbProjetada },
    { kind: "brilhante", label: "Brilhante", Thumb: ThumbBrilhante },
    { kind: "eco", label: "Eco", Thumb: ThumbEco },
    { kind: "falha", label: "Falha", Thumb: ThumbFalha },
  ];

  return (
    <div className={className ?? "bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 p-4 w-72 max-h-[80vh] overflow-y-auto select-none"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold">Efeitos</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={canUndo === false}
            className="h-7 w-7 grid place-items-center rounded-lg border border-black/10 dark:border-white/15 bg-white/70 dark:bg-neutral-800/70 hover:bg-white dark:hover:bg-neutral-700 transition disabled:opacity-40"
            title="Desfazer"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={canRedo === false}
            className="h-7 w-7 grid place-items-center rounded-lg border border-black/10 dark:border-white/15 bg-white/70 dark:bg-neutral-800/70 hover:bg-white dark:hover:bg-neutral-700 transition disabled:opacity-40"
            title="Refazer"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={removeEffect}
            disabled={activeKind === "none"}
            className="h-7 w-7 grid place-items-center rounded-lg border border-black/10 dark:border-white/15 bg-white/70 dark:bg-neutral-800/70 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 transition disabled:opacity-40"
            title="Remover efeito"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 grid place-items-center rounded-lg border border-black/10 dark:border-white/15 bg-white/70 dark:bg-neutral-800/70 hover:bg-white dark:hover:bg-neutral-700 transition"
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Effect thumbnails */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {EFFECTS.map(({ kind, label, Thumb }) => (
          <button
            key={kind}
            type="button"
            onClick={() => selectKind(kind)}
            className={`flex flex-col items-center gap-1 p-1 rounded-xl border-2 transition ${
              activeKind === kind
                ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                : "border-transparent hover:border-violet-200 dark:hover:border-violet-800"
            }`}
          >
            <div className="w-12 h-12">
              <Thumb />
            </div>
            <span className={`text-[10px] leading-tight text-center ${activeKind === kind ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Sliders for active effect */}
      {activeKind === "projetada" && (
        <div className="flex flex-col gap-3">
          <EffectSlider label="Direção" value={projetada.direction} min={-180} max={180} onChange={(v) => updateProjetada({ direction: v })} />
          <EffectSlider label="Distância" value={projetada.distance} min={0} max={60} onChange={(v) => updateProjetada({ distance: v })} />
          <EffectSlider label="Desfoque" value={projetada.blur} min={0} max={30} onChange={(v) => updateProjetada({ blur: v })} />
          <EffectSlider label="Transparência" value={projetada.transparency} min={0} max={100} onChange={(v) => updateProjetada({ transparency: v })} />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs flex-1">Cor</span>
            <ColorDot color={projetada.color} onChange={(c) => updateProjetada({ color: c })} />
          </div>
        </div>
      )}

      {activeKind === "brilhante" && (
        <div className="flex flex-col gap-3">
          <EffectSlider label="Intensidade" value={brilhante.intensity} min={0} max={100} onChange={(v) => updateBrilhante({ intensity: v })} />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs flex-1">Cor</span>
            <ColorDot color={brilhante.color} onChange={(c) => updateBrilhante({ color: c })} />
          </div>
        </div>
      )}

      {activeKind === "eco" && (
        <div className="flex flex-col gap-3">
          <EffectSlider label="Direção" value={eco.direction} min={-180} max={180} onChange={(v) => updateEco({ direction: v })} />
          <EffectSlider label="Distância" value={eco.distance} min={0} max={60} onChange={(v) => updateEco({ distance: v })} />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs flex-1">Cor</span>
            <ColorDot color={eco.color} onChange={(c) => updateEco({ color: c })} />
          </div>
        </div>
      )}

      {activeKind === "falha" && (
        <div className="flex flex-col gap-3">
          <EffectSlider label="Direção" value={falha.direction} min={-180} max={180} onChange={(v) => updateFalha({ direction: v })} />
          <EffectSlider label="Distância" value={falha.distance} min={0} max={60} onChange={(v) => updateFalha({ distance: v })} />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs flex-1">Cores</span>
            <ColorDot color={falha.color1} onChange={(c) => updateFalha({ color1: c })} />
            <ColorDot color={falha.color2} onChange={(c) => updateFalha({ color2: c })} />
          </div>
        </div>
      )}

      {activeKind === "none" && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Selecione um efeito para aplicar à forma
        </p>
      )}

      {/* Remove button */}
      {activeKind !== "none" && (
        <button
          type="button"
          onClick={removeEffect}
          className="mt-4 w-full h-9 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition"
        >
          Remover efeito
        </button>
      )}
    </div>
  );
}
