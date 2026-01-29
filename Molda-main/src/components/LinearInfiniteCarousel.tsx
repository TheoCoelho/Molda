import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@/styles/marquee-carousel.css";

type Item = {
  id: string;
  label: string;
  color?: string;
  description?: string;
};

type Props = {
  items: Item[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onConfirm?: (id: string) => void;
  ariaLabel?: string;
  className?: string;

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
  onConfirm,
  ariaLabel = "Carrossel",
  className,
  cardSize = 120,
  cardGapPx = 12,
  durationSec = 30,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportWidthRef = useRef(0);
  const offsetRef = useRef(0);

  // ===== Métricas
  const unit = cardSize + cardGapPx;
  const baseLen = useMemo(() => items.length * unit, [items.length, unit]);

  // ===== Estado de deslocamento (px)
  const [offsetPx, setOffsetPx] = useState(0);

  useEffect(() => {
    offsetRef.current = offsetPx;
  }, [offsetPx]);

  // ===== Drag + Inércia
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const velocityRef = useRef(0); // px/frame
  const rafRef = useRef<number | null>(null);
  const wheelSnapRef = useRef<number | null>(null);
  const lastMoveRef = useRef(1);
  const lastDistRef = useRef<number | null>(null);

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

  const centerInfo = useMemo(() => {
    if (!items.length || !viewportWidth) return { centerIndex: -1, snapOffset: 0 };
    const centerX = viewportWidth / 2;
    const total = items.length * 3;
    let minDist = Number.POSITIVE_INFINITY;
    let centerIndex = -1;
    for (let i = 0; i < total; i += 1) {
      const cellCenter = i * unit + normalizedOffset + cardSize / 2;
      const dist = Math.abs(centerX - cellCenter);
      if (dist < minDist) {
        minDist = dist;
        centerIndex = i;
      }
    }
    const snapOffset = centerIndex === -1 ? 0 : centerX - (centerIndex * unit + normalizedOffset + cardSize / 2);
    return { centerIndex, snapOffset };
  }, [items.length, viewportWidth, unit, normalizedOffset, cardSize]);

  const getSnapOffsetForIndex = useCallback(
    (index: number, rawOffset: number) => {
      const width = viewportWidthRef.current;
      if (!width || !items.length) return null;
      const baseLenLocal = items.length * unit;
      if (!baseLenLocal) return null;
      let x = rawOffset % baseLenLocal;
      if (x > 0) x -= baseLenLocal;
      const centerX = width / 2;
      const snapOffset = centerX - (index * unit + x + cardSize / 2);
      return snapOffset;
    },
    [items.length, unit, cardSize]
  );

  const getBestIndexForId = useCallback(
    (id: string, rawOffset: number) => {
      const baseIndex = items.findIndex((item) => item.id === id);
      if (baseIndex == -1) return null;
      const len = items.length;
      const candidates = [baseIndex, baseIndex + len, baseIndex + len * 2];
      let bestIndex = candidates[0];
      let bestOffset = getSnapOffsetForIndex(bestIndex, rawOffset) ?? 0;
      let bestDist = Math.abs(bestOffset);
      for (let i = 1; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        const offset = getSnapOffsetForIndex(candidate, rawOffset);
        if (offset == null) continue;
        const dist = Math.abs(offset);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = candidate;
          bestOffset = offset;
        }
      }
      return { index: bestIndex, snapOffset: bestOffset };
    },
    [items, getSnapOffsetForIndex]
  );

  const getSnapInfo = useCallback(
    (rawOffset: number) => {
      const width = viewportWidthRef.current;
      if (!width || !items.length) return null;
      const baseLenLocal = items.length * unit;
      if (!baseLenLocal) return null;
      let x = rawOffset % baseLenLocal;
      if (x > 0) x -= baseLenLocal;
      const centerX = width / 2;
      const total = items.length * 3;
      let minDist = Number.POSITIVE_INFINITY;
      let centerIndex = -1;
      for (let i = 0; i < total; i += 1) {
        const cellCenter = i * unit + x + cardSize / 2;
        const dist = Math.abs(centerX - cellCenter);
        if (dist < minDist) {
          minDist = dist;
          centerIndex = i;
        }
      }
      if (centerIndex === -1) return null;
      const snapOffset = centerX - (centerIndex * unit + x + cardSize / 2);
      return { snapOffset, dist: minDist };
    },
    [items.length, unit, cardSize]
  );

  const snapToNearest = useCallback(() => {
    const info = getSnapInfo(offsetRef.current);
    if (!info) return;
    setOffsetPx(offsetRef.current + info.snapOffset);
  }, [getSnapInfo]);

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
    lastDistRef.current = null;
    const step = () => {
      const info = getSnapInfo(offsetRef.current);
      if (info) {
        if (info.dist <= 0.5 || (lastDistRef.current != null && info.dist > lastDistRef.current)) {
          stopRaf();
          setOffsetPx(offsetRef.current + info.snapOffset);
          lastDistRef.current = null;
          return;
        }
        lastDistRef.current = info.dist;
      }
      if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
        const dir = Math.sign(lastMoveRef.current || 1);
        velocityRef.current = dir * Math.max(MIN_VELOCITY, 0.45);
      }
      setOffsetPx((prev) => prev + velocityRef.current);
      velocityRef.current *= FRICTION;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [getSnapInfo]);

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
    if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
      const dir = Math.sign(lastMoveRef.current || 1);
      velocityRef.current = dir * Math.max(MIN_VELOCITY, 0.45);
    }
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
    lastMoveRef.current = -delta;
    if (wheelSnapRef.current) window.clearTimeout(wheelSnapRef.current);
    wheelSnapRef.current = window.setTimeout(() => {
      if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
        const dir = Math.sign(lastMoveRef.current || 1);
        velocityRef.current = dir * Math.max(MIN_VELOCITY, 0.45);
      }
      animateInertia();
      wheelSnapRef.current = null;
    }, 140);
  }, [animateInertia]);

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
        if (selectedId) onConfirm?.(selectedId);
      }
    },
    [items, selectedId, onSelect, onConfirm]
  );

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const updateSize = () => {
      const width = el.getBoundingClientRect().width;
      viewportWidthRef.current = width;
      setViewportWidth(width);
    };
    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => stopRaf, []);

  useEffect(() => {
    if (!viewportWidth || !items.length) return;
    snapToNearest();
  }, [viewportWidth, items.length, snapToNearest]);

  // Style aplicado ao trilho
  const trackStyle: React.CSSProperties = {
    transform: `translate3d(${normalizedOffset}px, 0, 0)`,
    ["--item-size" as any]: `${cardSize}px`,
    ["--gap" as any]: `${cardGapPx}px`,
    ["--duration" as any]: `${durationSec}s`,
  };
  const viewportStyle: React.CSSProperties = {
    ["--item-size" as any]: `${cardSize}px`,
    ["--gap" as any]: `${cardGapPx}px`,
  };

  // Handler de clique que ignora quando houve arraste
  const smoothToOffset = useCallback((targetOffset: number) => {
    stopRaf();
    const start = offsetRef.current;
    const delta = targetOffset - start;
    const duration = 240;
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setOffsetPx(start + delta * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        stopRaf();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [stopRaf]);

  const makeCellClick = useCallback(
    (id: string) =>
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (didDragRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return; // ignorar "clique" ap??s arraste
        }
        const info = getBestIndexForId(id, offsetRef.current);
        if (info) smoothToOffset(offsetRef.current + info.snapOffset);
        if (selectedId === id) {
          onConfirm?.(id);
        } else {
          onSelect?.(id);
        }
      },
    [getBestIndexForId, onConfirm, onSelect, selectedId, smoothToOffset]
  );
  const getVisualStyle = (index: number): React.CSSProperties => {
    if (!items.length || !viewportWidth) return {};
    const centerX = viewportWidth / 2;
    const cellCenter = index * unit + normalizedOffset + cardSize / 2;
    const dist = Math.abs(centerX - cellCenter);
    const ratio = Math.min(dist / (unit * 1.5), 1);
    const scale = 1.06 - ratio * 0.06;
    const opacity = 1 - ratio * 0.35;
    const brightness = 1 - ratio * 0.08;
    const saturate = 1 - ratio * 0.1;
    return {
      ["--center-scale" as any]: scale.toFixed(3),
      ["--center-opacity" as any]: opacity.toFixed(3),
      ["--center-brightness" as any]: brightness.toFixed(3),
      ["--center-saturate" as any]: saturate.toFixed(3),
    };
  };

  return (
    <div
      ref={viewportRef}
      className={["marquee-viewport", className].filter(Boolean).join(" ")}
      style={viewportStyle}
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
            className={cellClass(item, selectedId, { centered: centerInfo.centerIndex === i, edge: Math.abs(i - centerInfo.centerIndex) === 1 })}
            role="option"
            aria-selected={selectedId === item.id}
            onClick={makeCellClick(item.id)}
            style={{ ...cellStyle(item), ...getVisualStyle(i) }}
          >
            <span className="marquee-cell-label">{item.label}</span>
            {item.description && <span className="marquee-cell-desc">{item.description}</span>}
          </button>
        ))}

        {triple[1].map((item, i) => (
          <button
            key={`base-${item.id}-${i}`}
            className={cellClass(item, selectedId, { centered: centerInfo.centerIndex === i + items.length, edge: Math.abs((i + items.length) - centerInfo.centerIndex) === 1 })}
            role="option"
            aria-selected={selectedId === item.id}
            onClick={makeCellClick(item.id)}
            style={{ ...cellStyle(item), ...getVisualStyle(i + items.length) }}
          >
            <span className="marquee-cell-label">{item.label}</span>
            {item.description && <span className="marquee-cell-desc">{item.description}</span>}
          </button>
        ))}

        {triple[2].map((item, i) => (
          <button
            key={`next-${item.id}-${i}`}
            className={cellClass(item, selectedId, { centered: centerInfo.centerIndex === i + items.length * 2, edge: Math.abs((i + items.length * 2) - centerInfo.centerIndex) === 1 })}
            role="option"
            aria-selected={selectedId === item.id}
            onClick={makeCellClick(item.id)}
            style={{ ...cellStyle(item), ...getVisualStyle(i + items.length * 2) }}
          >
            <span className="marquee-cell-label">{item.label}</span>
            {item.description && <span className="marquee-cell-desc">{item.description}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function cellClass(item: Item, selectedId?: string | null, flags?: { centered?: boolean; edge?: boolean }) {
  const isSelected = selectedId === item.id;
  const isDimmed = !!selectedId && !isSelected;
  return [
    "marquee-cell",
    isSelected ? "is-selected" : "",
    isDimmed ? "is-dimmed" : "",
    flags?.centered ? "is-centered" : "",
    flags?.edge ? "is-edge" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function cellStyle(item: Item): React.CSSProperties {
  const color = item.color || "#8884d8";
  return { ["--cell-accent" as any]: color };
}
