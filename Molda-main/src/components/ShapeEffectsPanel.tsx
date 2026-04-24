import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X, Trash2, Undo2, Redo2 } from "lucide-react";
import type { Editor2DHandle, ShapeEffectParams } from "./Editor2D";

type Props = {
  editor: { current: Editor2DHandle | undefined | null };
  visible?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClose?: () => void;
  className?: string;
};

type ProjetadaEffect = Extract<ShapeEffectParams, { kind: "projetada" }>;
type BrilhanteEffect = Extract<ShapeEffectParams, { kind: "brilhante" }>;
type EcoEffect = Extract<ShapeEffectParams, { kind: "eco" }>;
type FalhaEffect = Extract<ShapeEffectParams, { kind: "falha" }>;
type GrainEffect = Extract<ShapeEffectParams, { kind: "grain" }>;

type EffectKind = ShapeEffectParams["kind"];

const DEFAULT_PROJETADA: ProjetadaEffect = {
  kind: "projetada",
  direction: -45,
  distance: 20,
  blur: 10,
  transparency: 30,
  color: "#000000",
};

const DEFAULT_BRILHANTE: BrilhanteEffect = {
  kind: "brilhante",
  intensity: 40,
  color: "#000000",
};

const DEFAULT_ECO: EcoEffect = {
  kind: "eco",
  direction: -52,
  distance: 13,
  color: "#000000",
};

const DEFAULT_FALHA: FalhaEffect = {
  kind: "falha",
  direction: -55,
  distance: 9,
  color1: "#ff00ff",
  color2: "#00ffff",
};

const DEFAULT_GRAIN: GrainEffect = {
  kind: "grain",
  amount: 45,
  size: 36,
  monochrome: true,
};

function Slider({
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
  onChange: (value: number) => void;
}) {
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
        <span className="text-xs tabular-nums w-10 text-center">{value}</span>
      </div>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border border-black/15 dark:border-white/20 bg-transparent cursor-pointer"
      />
    </label>
  );
}

export default function ShapeEffectsPanel({
  editor,
  visible = true,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClose,
  className,
}: Props) {
  const [activeKind, setActiveKind] = useState<EffectKind | null>(null);

  const [projetada, setProjetada] = useState<ProjetadaEffect>(DEFAULT_PROJETADA);
  const [brilhante, setBrilhante] = useState<BrilhanteEffect>(DEFAULT_BRILHANTE);
  const [eco, setEco] = useState<EcoEffect>(DEFAULT_ECO);
  const [falha, setFalha] = useState<FalhaEffect>(DEFAULT_FALHA);
  const [grain, setGrain] = useState<GrainEffect>(DEFAULT_GRAIN);

  const active = activeKind !== null;

  useEffect(() => {
    if (!visible) return;
    const current = editor.current?.getActiveShapeEffect?.();
    if (!current) {
      setActiveKind(null);
      return;
    }

    setActiveKind(current.kind);
    if (current.kind === "projetada") setProjetada(current);
    else if (current.kind === "brilhante") setBrilhante(current);
    else if (current.kind === "eco") setEco(current);
    else if (current.kind === "falha") setFalha(current);
    else if (current.kind === "grain") setGrain(current);
  }, [visible, editor]);

  const apply = useCallback(
    (effect: ShapeEffectParams) => {
      editor.current?.applyShapeEffect?.(effect);
      setActiveKind(effect.kind);
    },
    [editor]
  );

  const removeEffect = () => {
    setActiveKind(null);
    editor.current?.removeShapeEffect?.();
  };

  const buttons = useMemo(
    () => [
      { kind: "projetada" as const, label: "Projetada" },
      { kind: "brilhante" as const, label: "Brilhante" },
      { kind: "eco" as const, label: "Eco" },
      { kind: "falha" as const, label: "Falha" },
      { kind: "grain" as const, label: "Grain" },
    ],
    []
  );

  if (!visible) return null;

  return (
    <div
      className={
        className ??
        "bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 p-4 w-80 max-h-[80vh] overflow-y-auto select-none"
      }
    >
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
            disabled={!active}
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

      <div className="grid grid-cols-2 gap-2 mb-3">
        {buttons.map((button) => (
          <button
            key={button.kind}
            type="button"
            onClick={() => {
              if (button.kind === "projetada") apply(projetada);
              else if (button.kind === "brilhante") apply(brilhante);
              else if (button.kind === "eco") apply(eco);
              else if (button.kind === "falha") apply(falha);
              else apply(grain);
            }}
            className={`h-10 rounded-xl border-2 transition text-sm font-medium ${
              activeKind === button.kind
                ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
                : "border-black/10 dark:border-white/15 hover:border-violet-300"
            }`}
          >
            {button.label}
          </button>
        ))}
      </div>

      {activeKind === "projetada" && (
        <div className="flex flex-col gap-3 mb-3">
          <Slider
            label="Direcao"
            value={projetada.direction}
            min={-180}
            max={180}
            onChange={(value) => {
              const next: ProjetadaEffect = { ...projetada, direction: value };
              setProjetada(next);
              apply(next);
            }}
          />
          <Slider
            label="Distancia"
            value={projetada.distance}
            min={0}
            max={60}
            onChange={(value) => {
              const next: ProjetadaEffect = { ...projetada, distance: value };
              setProjetada(next);
              apply(next);
            }}
          />
          <Slider
            label="Blur"
            value={projetada.blur}
            min={0}
            max={30}
            onChange={(value) => {
              const next: ProjetadaEffect = { ...projetada, blur: value };
              setProjetada(next);
              apply(next);
            }}
          />
          <Slider
            label="Transparencia"
            value={projetada.transparency}
            min={0}
            max={100}
            onChange={(value) => {
              const next: ProjetadaEffect = { ...projetada, transparency: value };
              setProjetada(next);
              apply(next);
            }}
          />
          <ColorInput
            label="Cor"
            value={projetada.color}
            onChange={(value) => {
              const next: ProjetadaEffect = { ...projetada, color: value };
              setProjetada(next);
              apply(next);
            }}
          />
        </div>
      )}

      {activeKind === "brilhante" && (
        <div className="flex flex-col gap-3 mb-3">
          <Slider
            label="Intensidade"
            value={brilhante.intensity}
            min={0}
            max={100}
            onChange={(value) => {
              const next: BrilhanteEffect = { ...brilhante, intensity: value };
              setBrilhante(next);
              apply(next);
            }}
          />
          <ColorInput
            label="Cor"
            value={brilhante.color}
            onChange={(value) => {
              const next: BrilhanteEffect = { ...brilhante, color: value };
              setBrilhante(next);
              apply(next);
            }}
          />
        </div>
      )}

      {activeKind === "eco" && (
        <div className="flex flex-col gap-3 mb-3">
          <Slider
            label="Direcao"
            value={eco.direction}
            min={-180}
            max={180}
            onChange={(value) => {
              const next: EcoEffect = { ...eco, direction: value };
              setEco(next);
              apply(next);
            }}
          />
          <Slider
            label="Distancia"
            value={eco.distance}
            min={0}
            max={60}
            onChange={(value) => {
              const next: EcoEffect = { ...eco, distance: value };
              setEco(next);
              apply(next);
            }}
          />
          <ColorInput
            label="Cor"
            value={eco.color}
            onChange={(value) => {
              const next: EcoEffect = { ...eco, color: value };
              setEco(next);
              apply(next);
            }}
          />
        </div>
      )}

      {activeKind === "falha" && (
        <div className="flex flex-col gap-3 mb-3">
          <Slider
            label="Direcao"
            value={falha.direction}
            min={-180}
            max={180}
            onChange={(value) => {
              const next: FalhaEffect = { ...falha, direction: value };
              setFalha(next);
              apply(next);
            }}
          />
          <Slider
            label="Distancia"
            value={falha.distance}
            min={0}
            max={60}
            onChange={(value) => {
              const next: FalhaEffect = { ...falha, distance: value };
              setFalha(next);
              apply(next);
            }}
          />
          <ColorInput
            label="Cor 1"
            value={falha.color1}
            onChange={(value) => {
              const next: FalhaEffect = { ...falha, color1: value };
              setFalha(next);
              apply(next);
            }}
          />
          <ColorInput
            label="Cor 2"
            value={falha.color2}
            onChange={(value) => {
              const next: FalhaEffect = { ...falha, color2: value };
              setFalha(next);
              apply(next);
            }}
          />
        </div>
      )}

      {activeKind === "grain" && (
        <div className="flex flex-col gap-3 mb-3">
          <Slider
            label="Amount"
            value={grain.amount}
            min={0}
            max={100}
            onChange={(value) => {
              const next: GrainEffect = { ...grain, amount: value };
              setGrain(next);
              apply(next);
            }}
          />
          <Slider
            label="Size"
            value={grain.size}
            min={6}
            max={100}
            onChange={(value) => {
              const next: GrainEffect = { ...grain, size: value };
              setGrain(next);
              apply(next);
            }}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={grain.monochrome}
              onChange={(e) => {
                const next: GrainEffect = { ...grain, monochrome: e.target.checked };
                setGrain(next);
                apply(next);
              }}
            />
            Monochrome
          </label>
        </div>
      )}

      {!active && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Escolha um efeito para aplicar no objeto selecionado
        </p>
      )}
    </div>
  );
}
