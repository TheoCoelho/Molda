import React, { useEffect, useMemo, useRef, useState } from "react";

type Item = { id: string; label: string; color?: string };

type Props = {
  items: Item[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  /** raio em px (distância do centro) */
  radius?: number;
  /** largura base do card em px (altura ≈ 1.4×) */
  cardSize?: number;
  /** sensibilidade do arrasto em graus por pixel */
  dragSensitivity?: number;
  /** duplica itens para “anel cheio” (loop suave) */
  minCards?: number;
  /** arco visível (deg). Ex.: 160 → linear com profundidade */
  visibleArcDeg?: number;
  /** largura (em deg) do fade nas bordas do arco */
  edgeFadeDeg?: number;
  className?: string;
};

function norm360(a: number) {
  return ((a % 360) + 360) % 360;
}
function toSigned180(a: number) {
  const n = norm360(a);
  return n > 180 ? n - 360 : n; // [-180, 180]
}

/** Carrossel circular 3D com “arco expandido” (look linear),
 *  escala central > bordas, fade nas laterais e arrasto nos dois sentidos.
 */
export default function CircularCarousel3D({
  items,
  selectedId,
  onSelect,
  radius = 180,
  cardSize = 100,
  dragSensitivity = 0.35,
  minCards = 12,
  visibleArcDeg = 160,  // “abre” o círculo -> sensação linear
  edgeFadeDeg = 16,     // fade nas extremidades do arco
  className = "",
}: Props) {
  // Duplica itens para dar sensação de continuidade quando houver poucos
  const ringItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    const total = Math.max(minCards, items.length);
    const out: Item[] = [];
    for (let i = 0; i < total; i++) out.push(items[i % items.length]);
    return out;
  }, [items, minCards]);

  const step = 360 / Math.max(ringItems.length || 1, 1);
  const halfArc = Math.max(10, Math.min(visibleArcDeg, 340)) / 2; // segurança

  const [theta, setTheta] = useState(0);

  // Arrasto com limiar (não mata o click)
  const isPointerDownRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const startXRef = useRef(0);
  const startThetaRef = useRef(0);
  const thresholdPx = 5;

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      isPointerDownRef.current = true;
      hasDraggedRef.current = false;
      startXRef.current = e.clientX;
      startThetaRef.current = theta;
      el.classList.add("is-dragging");
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      const dx = e.clientX - startXRef.current;
      if (!hasDraggedRef.current && Math.abs(dx) >= thresholdPx) {
        hasDraggedRef.current = true;
      }
      if (hasDraggedRef.current) {
        const next = startThetaRef.current + dx * dragSensitivity;
        setTheta(norm360(next));
      }
    };
    const onPointerUp = () => {
      isPointerDownRef.current = false;
      el.classList.remove("is-dragging");
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const preventSelect = (ev: Event) => {
      if (isPointerDownRef.current && hasDraggedRef.current) ev.preventDefault();
    };
    document.addEventListener("selectstart", preventSelect);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectstart", preventSelect);
    };
  }, [theta, dragSensitivity]);

  // Ring (rotaciona com theta). O “linear feel” vem do recorte por arco + escala/opacity por ângulo relativo.
  const ringStyle: React.CSSProperties = {
    transformStyle: "preserve-3d",
    transform: `perspective(800px) rotateY(${theta}deg)`,
    willChange: "transform",
    width: "100%",
    height: "100%",
    position: "relative",
    zIndex: 1,
  };

  return (
    <div
      ref={containerRef}
      className={`carousel3d-container ${className}`}
      aria-live="polite"
    >
      <div className="carousel3d-viewport">
        <div className="carousel3d-ring" style={ringStyle}>
          {ringItems.map((item, idx) => {
            // Ângulo absoluto do card após rotação do anel (em relação à câmera)
            const totalDeg = theta + idx * step;
            const rel = toSigned180(totalDeg); // [-180, 180], 0 = centro

            // Visibilidade: só dentro do arco +/- halfArc (com fade nas pontas)
            const absRel = Math.abs(rel);

            // Escala (maior no centro, menor nas bordas do arco)
            // curva suave (cos) mapeada para [minScale, maxScale]
            const t = Math.min(1, absRel / halfArc); // 0 centro, 1 borda do arco
            const minScale = 0.82;
            const maxScale = 1.12;
            const scale = minScale + (maxScale - minScale) * Math.cos((t * Math.PI) / 2);

            // Profundidade simulada: leve translateY para “curvar” os cartões
            const yOffset = (1 - scale) * 22; // sobe no centro, desce nas bordas

            // Fade nas bordas (dentro de edgeFadeDeg a partir do limite do arco)
            let opacity = 1;
            if (absRel > halfArc - edgeFadeDeg) {
              // Quando passa do limite, cai para 0; antes do limite, é 1
              const over = absRel - (halfArc - edgeFadeDeg);
              opacity = Math.max(0, 1 - over / edgeFadeDeg);
            }
            // Fora do arco, oculta completamente
            if (absRel > halfArc + edgeFadeDeg) opacity = 0;

            const style: React.CSSProperties = {
              transform: `translate(-50%, -50%) rotateY(${idx * step}deg) translateZ(${radius}px) translateY(${yOffset}px) scale(${scale})`,
              width: cardSize,
              height: Math.round(cardSize * 1.4),
              borderColor: "hsl(var(--border))",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,248,248,0.94) 100%)",
              opacity,
              pointerEvents: opacity > 0.25 ? "auto" : "none",
            };
            const active = selectedId === item.id;

            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                className={`carousel3d-card ${active ? "is-active" : ""}`}
                style={style}
                aria-pressed={active}
                aria-label={`Selecionar ${item.label}`}
                title={item.label}
                onClick={() => {
                  if (hasDraggedRef.current) return;
                  onSelect(active ? null : item.id); // toggle
                }}
              >
                <span className="carousel3d-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Máscara/fade nas laterais (CSS mask) — somem suavemente e “retornam” do outro lado */}
        <div className="carousel3d-mask" aria-hidden="true" />
      </div>
    </div>
  );
}
