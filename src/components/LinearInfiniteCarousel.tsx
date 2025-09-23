import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import "../styles/marquee-carousel.css";

type GetLabel<T> = (item: T, index: number) => string;
type GetKey<T> = (item: T, index: number) => React.Key;
type GetBorderColor<T> = (item: T, index: number) => string | undefined;
type GetId<T> = (item: T, index: number) => string;

export interface LinearInfiniteCarouselProps<T = any> {
  /** Classe adicional para o container */
  className?: string;

  /** Lista de itens */
  items: T[];

  /**
   * Handler de seleção:
   * - Modo por ID (compatível com seu Create.tsx): onSelect(id: string)
   * - Modo por item: onSelect(item: T, index: number)
   */
  onSelect?: ((id: string, index?: number) => void) | ((item: T, index: number) => void);

  /** Seleção por índice (modo item) */
  selectedIndex?: number | null;

  /** Seleção por função (modo item) */
  selected?: (item: T, index: number) => boolean;

  /** Seleção por ID (modo id) — compatível com Create.tsx */
  selectedId?: string | null;

  /** Mapeadores opcionais */
  getLabel?: GetLabel<T>;
  getKey?: GetKey<T>;
  getBorderColor?: GetBorderColor<T>;
  getId?: GetId<T>;

  /** Aparência/tempo do marquee */
  durationSec?: number; // default 30
  itemSize?: number; // lado do quadrado em px — default 160
  gap?: number; // espaçamento em px — default 16
  reverse?: boolean; // animação reversa (útil para 2º carrossel)
  ariaLabel?: string;

  /** Props legadas (aceitas para não quebrar Create.tsx) */
  cardSize?: number;       // mapeado para itemSize
  cardGapPx?: number;      // mapeado para gap
  dragSensitivity?: number; // ignorado
  scaleAmplitude?: number;  // ignorado
  sigmaSteps?: number;      // ignorado
}

/** Padrões robustos para diferentes formatos de item */
function defaultGetLabel(item: any): string {
  return (
    item?.label ??
    item?.name ??
    item?.title ??
    (typeof item === "string" ? item : String(item?.id ?? ""))
  );
}

function defaultGetKey(item: any, i: number): React.Key {
  return item?.id ?? item?.key ?? item?.value ?? defaultGetLabel(item) ?? i;
}

function defaultGetBorderColor(item: any): string | undefined {
  return item?.color ?? item?.borderColor ?? undefined;
}

function defaultGetId(item: any, index: number): string {
  // Por padrão usamos item.id; se não houver, usamos o label
  return (item?.id ?? defaultGetLabel(item)) as string;
}

export default function LinearInfiniteCarousel<T = any>({
  className,
  items,
  onSelect,
  selectedIndex = null,
  selected,
  selectedId, // <- ativa "modo por id" quando definido
  getLabel = defaultGetLabel,
  getKey = defaultGetKey,
  getBorderColor = defaultGetBorderColor,
  getId = defaultGetId,
  durationSec,
  itemSize,
  gap,
  reverse = false,
  ariaLabel,

  // legados (não quebrar Create.tsx)
  cardSize,
  cardGapPx,
}: LinearInfiniteCarouselProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalização dos tamanhos: prioriza novos props, cai nos legados se não vierem
  const effectiveItemSize = itemSize ?? cardSize ?? 160;
  const effectiveGap = gap ?? cardGapPx ?? 16;
  const effectiveDuration = durationSec ?? 30;

  const baseCount = Math.max(1, items?.length ?? 0);
  const [repeat, setRepeat] = useState(1);

  // Repetição automática para preencher espaço e manter o loop sem "buracos"
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const width = el.clientWidth || 0;
      const unit = effectiveItemSize + effectiveGap; // px por item
      // Queremos ~2 larguras de viewport para o loop ficar sempre preenchido
      const minDistance = width * 2 + unit * 2;
      const needed = Math.ceil(minDistance / unit);
      const r = Math.max(1, Math.ceil(needed / baseCount));
      setRepeat(Math.min(r, 8)); // limite de segurança
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseCount, effectiveItemSize, effectiveGap]);

  const repeatedIndexes = useMemo(() => {
    const total = baseCount * repeat;
    return Array.from({ length: total }, (_, i) => i);
  }, [baseCount, repeat]);

  const totalItems = baseCount * repeat;

  // Variáveis CSS do container (marquee)
  const cssVars: React.CSSProperties = {
    // @ts-expect-error custom props
    "--items": totalItems,
    "--carousel-duration": `${effectiveDuration}s`,
    "--carousel-item-width": `${effectiveItemSize}px`,
    "--carousel-item-height": `${effectiveItemSize}px`,
    "--carousel-item-gap": `${effectiveGap}px`,
  };

  const isIdMode = typeof selectedId !== "undefined";

  return (
    <div
      ref={containerRef}
      className={clsx("marquee-carousel", reverse && "is-reverse", className)}
      style={cssVars}
      data-mask="true"
      aria-label={ariaLabel}
      role="listbox"
    >
      {repeatedIndexes.map((idx) => {
        const origIndex = idx % baseCount;
        const item = items[origIndex];
        const label = getLabel(item, origIndex);
        const id = getId(item, origIndex);
        const color = getBorderColor?.(item, origIndex);

        const key = `${getKey(item, origIndex)}__rep${Math.floor(idx / baseCount)}_${origIndex}`;

        const isSelected =
          selected?.(item, origIndex) ??
          (selectedIndex !== null && selectedIndex === origIndex) ??
          (selectedId != null && id === selectedId);

        const style: React.CSSProperties = {
          // @ts-expect-error custom var
          "--i": idx,
          ...(color ? ({ ["--border-color" as any]: color } as any) : null),
        };

        const handleSelect = () => {
          if (!onSelect) return;
          // Compatibilidade: se selectedId foi fornecido, assumimos modo "por id"
          if (isIdMode) {
            (onSelect as (id: string, index?: number) => void)(id, origIndex);
          } else {
            (onSelect as (item: T, index: number) => void)(item, origIndex);
          }
        };

        const handleKey = (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelect();
          }
        };

        return (
          <article
            key={key}
            className={clsx("marquee-item", isSelected && "is-selected")}
            style={style}
            role="option"
            aria-selected={!!isSelected}
            tabIndex={0}
            onClick={handleSelect}
            onKeyDown={handleKey}
          >
            <span className="label">{label}</span>
          </article>
        );
      })}
    </div>
  );
}
