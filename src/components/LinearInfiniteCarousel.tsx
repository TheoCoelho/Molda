import React, { useEffect, useMemo, useRef, useState } from "react";

type Item = { id: string; label: string };

type Props = {
  items: Item[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;

  /** largura base do card em px (altura ≈ 1.4×) */
  cardSize?: number;
  /** espaço horizontal entre cards em px */
  cardGapPx?: number;
  /** sensibilidade do arrasto: 1px mouse => N px trilho */
  dragSensitivity?: number;

  /** amplitude do “bump” central (0.0 .. 0.5), ex.: 0.22 = +22% no centro */
  scaleAmplitude?: number;
  /** largura da região de influência do centro (em passos de card), ex.: 1.3 */
  sigmaSteps?: number;

  className?: string;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * Carrossel LINEAR infinito real:
 * - rolagem infinita para ambos os lados (sem warp/snap visual; offset não é recortado);
 * - fade lateral super gradual por opacidade (cosine), sem sombras/overlays;
 * - ampliação central natural (gaussiana), estilo Uiverse.
 */
export default function LinearInfiniteCarousel({
  items,
  selectedId = null,
  onSelect,
  cardSize = 128,
  cardGapPx = 20,
  dragSensitivity = 1,
  scaleAmplitude = 0.22,
  sigmaSteps = 1.3,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(520); // default visual

  const N = Math.max(items.length, 1);
  const cardW = cardSize;
  const cardH = Math.round(cardSize * 1.4);
  const stepW = cardW + cardGapPx;

  // Offset do trilho em pixels (origem no centro). Pode crescer sem limites (∞).
  const [offset, setOffset] = useState(0);

  // Arrasto com threshold p/ não matar clique
  const isDown = useRef(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragged = useRef(false);
  const threshold = 5;

  // Responsividade e listeners
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerW(Math.round(e.contentRect.width));
    });
    ro.observe(el);

    const onPointerDown = (e: PointerEvent) => {
      isDown.current = true;
      dragged.current = false;
      startX.current = e.clientX;
      startOffset.current = offset;
      el.classList.add("is-dragging");
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDown.current) return;
      const dx = (e.clientX - startX.current) * dragSensitivity;
      if (!dragged.current && Math.abs(dx) > threshold) dragged.current = true;
      setOffset(startOffset.current + dx); // ✅ sem wrap: infinito real
    };
    const onPointerUp = () => {
      isDown.current = false;
      el.classList.remove("is-dragging");
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const preventSelect = (ev: Event) => {
      if (isDown.current && dragged.current) ev.preventDefault();
    };
    document.addEventListener("selectstart", preventSelect);

    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectstart", preventSelect);
    };
  }, [offset, dragSensitivity]);

  // Rebase ocasional do offset para evitar números muito grandes ao longo do tempo
  useEffect(() => {
    const CYCLE = Math.max(1, N) * stepW;
    if (Math.abs(offset) > 1e7 && CYCLE > 0) {
      // mantém o mesmo estado visual (equivalência modular), mas com número menor
      setOffset(offset % CYCLE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  // Quantos cartões renderizar? (viewport + sobra para arrasto rápido)
  const slots = useMemo(() => {
    const visible = Math.ceil(containerW / stepW);
    return Math.max(visible + 16, 24); // janela generosa
  }, [containerW, stepW]);

  // Indice base que está imediatamente à esquerda do centro (x<=0)
  const anchorN = Math.floor(-offset / stepW);
  const startN = anchorN - Math.floor(slots / 2);

  // Fade lateral super gradual (cosine) – valores em px
  const innerZone = containerW * 0.42; // até aqui opacidade ≈1
  const fadeWidth = containerW * 0.40; // faixa de desvanecimento ampla (muito suave)
  const opacityAt = (x: number) => {
    const ax = Math.abs(x);
    if (ax <= innerZone) return 1;
    const t = clamp((ax - innerZone) / fadeWidth, 0, 1); // 0..1
    // cosine: t=0 => 1, t=1 => 0 (curva suave)
    return Math.cos((Math.PI / 2) * t);
  };

  // Escala central “Uiverse-like” — gaussiana por passos
  const baseScale = 1 - scaleAmplitude * 0.10; // reequilíbrio leve nas laterais
  const scaleAt = (x: number) => {
    const xStep = x / stepW; // em “cards”
    const g = Math.exp(-(xStep * xStep) / (2 * sigmaSteps * sigmaSteps));
    return baseScale + scaleAmplitude * g;
  };

  // z-index maior no centro para sobreposições corretas
  const zIndexAt = (x: number) => 100000 - Math.round(Math.abs(x));

  const itemsToRender = new Array(slots).fill(0).map((_, s) => startN + s);

  return (
    <div ref={containerRef} className={`lcar-container ${className}`} aria-live="polite">
      <div className="lcar-viewport">
        <div className="lcar-track">
          {itemsToRender.map((n) => {
            const x = n * stepW + offset;                // posição do centro do card
            const idx = mod(n, N);                       // índice cíclico do item
            const item = items[idx];

            const opacity = opacityAt(x);
            if (opacity <= 0) return null;               // economiza DOM quando invisível

            const scale = scaleAt(x);
            const zIndex = zIndexAt(x);

            const style: React.CSSProperties = {
              transform: `translate(-50%, -50%) translateX(${x}px) scale(${scale})`,
              width: cardW,
              height: cardH,
              opacity,
              zIndex,
            };

            const active = selectedId === item.id;

            return (
              <button
                key={`${n}-${item.id}`}
                type="button"
                className={`lcar-card ${active ? "is-active" : ""}`}
                style={style}
                aria-pressed={active}
                aria-label={`Selecionar ${item.label}`}
                title={item.label}
                onClick={() => {
                  if (dragged.current) return;
                  onSelect?.(active ? null : item.id);
                }}
              >
                <span className="lcar-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
