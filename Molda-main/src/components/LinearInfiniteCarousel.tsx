import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@/styles/marquee-carousel.css";

type Item = {
  id: string;
  label: string;
  color?: string;
};

type Props = {
  items: Item[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  ariaLabel?: string;

  cardSize?: number;
  cardGapPx?: number;
  durationSec?: number; // compat.

  // compat. (não usados para movimento)
  dragSensitivity?: number;
  scaleAmplitude?: number;
  sigmaSteps?: number;
};

export default function LinearInfiniteCarousel({
  items,
  selectedId,
  onSelect,
  ariaLabel = "Carrossel",
  cardSize = 120,
  cardGapPx = 12,
  durationSec = 30,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // ===== Métricas
  const unit = cardSize + cardGapPx;
  const baseLen = useMemo(() => items.length * unit, [items.length, unit]);

  // ===== Estado de deslocamento (px)
  const [offsetPx, setOffsetPx] = useState(0);

  // ===== Drag + Inércia
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const velocityRef = useRef(0); // px/frame
  const rafRef = useRef<number | null>(null);

  // Tap slop para distinguir clique x arraste
  const TAP_SLOP = 6; // px
  const dragAccumRef = useRef(0);
  const didDragRef = useRef(false);

  const FRICTION = 0.94;
  const MIN_VELOCITY = 0.1;

  // Normalização: manter translateX em [-baseLen, 0]
  const normalizedOffset = useMemo(() => {
    if (baseLen === 0) return 0;
    let x = offsetPx % baseLen;
    if (x > 0) x -= baseLen;
    return x;
  }, [offsetPx, baseLen]);

  // Repetição tripla para loop bilateral
  const triple = useMemo(() => [items, items, items] as const, [items]);

  // RAF controle
  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const animateInertia = useCallback(() => {
    stopRaf();
    const step = () => {
      if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
        stopRaf();
        return;
      }
      setOffsetPx((prev) => prev + velocityRef.current);
      velocityRef.current *= FRICTION;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // ===== Pointer
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    velocityRef.current = 0;
    dragAccumRef.current = 0;
    didDragRef.current = false;
    stopRaf();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;

    // acumula distância para detectar arraste
    dragAccumRef.current += Math.abs(dx);
    if (dragAccumRef.current > TAP_SLOP) didDragRef.current = true;

    setOffsetPx((prev) => prev + dx);
    velocityRef.current = dx; // velocidade instantânea
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    // inicia inércia com a velocidade atual
    animateInertia();
  }, [animateInertia]);

  // ===== Wheel → move horizontalmente
  const onWheel = useCallback((e: React.WheelEvent) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    e.preventDefault();
    stopRaf();
    velocityRef.current = 0;
    didDragRef.current = true; // roda do mouse não deve contar como clique
    setOffsetPx((prev) => prev - delta);
  }, []);

  // ===== A11y por teclado
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!items.length) return;
      const idx = items.findIndex((it) => it.id === selectedId);
      if (idx === -1) return;

      if (e.key === "ArrowRight") {
        const next = items[(idx + 1) % items.length];
        onSelect?.(next.id);
      } else if (e.key === "ArrowLeft") {
        const prev = items[(idx - 1 + items.length) % items.length];
        onSelect?.(prev.id);
      } else if (e.key === "Enter" || e.key === " ") {
        if (selectedId) onSelect?.(selectedId);
      }
    },
    [items, selectedId, onSelect]
  );

  useEffect(() => stopRaf, []);

  // Style aplicado ao trilho
  const trackStyle: React.CSSProperties = {
    transform: `translate3d(${normalizedOffset}px, 0, 0)`,
    ["--item-size" as any]: `${cardSize}px`,
    ["--gap" as any]: `${cardGapPx}px`,
    ["--duration" as any]: `${durationSec}s`,
  };

  // Handler de clique que ignora quando houve arraste
  const makeCellClick = useCallback(
    (id: string) =>
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (didDragRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return; // ignorar "clique" após arraste
        }
        onSelect?.(id);
      },
    [onSelect]
  );

  return (
    <div
      ref={viewportRef}
      className="marquee-viewport"
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="marquee-track no-anim" style={trackStyle}>
        {triple[0].map((item, i) => (
          <button
            key={`prev-${item.id}-${i}`}
            className={cellClass(item, selectedId)}
            role="option"
            aria-selected={selectedId === item.id}
            onClick={makeCellClick(item.id)}
            style={cellStyle(item)}
          >
            <span className="marquee-cell-label">{item.label}</span>
          </button>
        ))}

        {triple[1].map((item, i) => (
          <button
            key={`base-${item.id}-${i}`}
            className={cellClass(item, selectedId)}
            role="option"
            aria-selected={selectedId === item.id}
            onClick={makeCellClick(item.id)}
            style={cellStyle(item)}
          >
            <span className="marquee-cell-label">{item.label}</span>
          </button>
        ))}

        {triple[2].map((item, i) => (
          <button
            key={`next-${item.id}-${i}`}
            className={cellClass(item, selectedId)}
            role="option"
            aria-selected={selectedId === item.id}
            onClick={makeCellClick(item.id)}
            style={cellStyle(item)}
          >
            <span className="marquee-cell-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function cellClass(item: Item, selectedId?: string | null) {
  const isSelected = selectedId === item.id;
  return ["marquee-cell", isSelected ? "is-selected" : ""]
    .filter(Boolean)
    .join(" ");
}

function cellStyle(item: Item): React.CSSProperties {
  const color = item.color || "#8884d8";
  return { ["--cell-accent" as any]: color };
}
