import { useState } from "react";

type ExpirationTimerProps = {
  remainingMs: number;
  onMakePermanent: () => void;
  className?: string;
};

const ExpirationTimer = ({ remainingMs, onMakePermanent, className }: ExpirationTimerProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Calcula o percentual do tempo restante (5min = 300s)
  const TOTAL_DURATION_MS = 5 * 60 * 1000;
  const percentRemaining = Math.max(0, Math.min(100, (remainingMs / TOTAL_DURATION_MS) * 100));
  
  // Stroke dasharray para animação do círculo (raio maior para ocupar todo o espaço)
  const radius = 10.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentRemaining / 100) * circumference;

  // Cor do relógio baseada no tempo restante
  const getStrokeColor = () => {
    if (percentRemaining > 50) return "#00d4ff"; // Azul ciano
    if (percentRemaining > 20) return "#f59e0b"; // Âmbar
    return "#ef4444"; // Vermelho
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPaused(true);
    // Aguarda a animação de fade-out antes de salvar
    setTimeout(() => {
      onMakePermanent();
    }, 300);
  };

  return (
    <div className={`expiration-timer-container ${isPaused ? 'fade-out' : ''} ${className || ''}`}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="expiration-timer-button"
        title="Clique para salvar permanentemente"
      >
        <svg
          className="expiration-timer-icon"
          strokeLinejoin="round"
          strokeLinecap="round"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            "--stroke-color": getStrokeColor(),
          } as React.CSSProperties}
        >
          {/* Círculo de progresso */}
          <circle
            cx="12"
            cy="12"
            r={radius}
            className="expiration-timer-progress"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
              transition: "stroke-dashoffset 1s linear",
            }}
          />
        </svg>
      </button>
      <span 
        className="expiration-timer-text-side"
        style={{ color: getStrokeColor() }}
      >
        {timeLabel}
      </span>
    </div>
  );
};

export default ExpirationTimer;
