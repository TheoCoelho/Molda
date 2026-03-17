import React, { useRef, useState, useEffect } from 'react';

interface GradientAngleJoystickProps {
  angle: number;
  onChange: (angle: number) => void;
  onFinalChange?: () => void;
}

export const GradientAngleJoystick: React.FC<GradientAngleJoystickProps> = ({
  angle,
  onChange,
  onFinalChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const calculateAngle = (e: React.PointerEvent | PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const x = e.clientX - centerX;
    const y = e.clientY - centerY;
    
    let rad = Math.atan2(y, x);
    let deg = (rad * 180) / Math.PI;
    
    // Normalize to 0-360
    deg = (deg + 360) % 360;

    // Snap logic
    const snapPoints = [0, 45, 90, 180, 270, 360];
    const threshold = 3;
    for (const snap of snapPoints) {
      if (Math.abs(deg - snap) <= threshold) {
        deg = snap % 360;
        break;
      }
    }
    
    onChange(Math.round(deg));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    calculateAngle(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    calculateAngle(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    onFinalChange?.();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        ref={containerRef}
        className={`
          relative w-14 h-14 rounded-full border-2 cursor-crosshair transition-all duration-200
          ${isDragging 
            ? 'border-primary shadow-[0_0_15px_rgba(var(--primary),0.3)] bg-primary/5' 
            : 'border-black/10 dark:border-white/20 bg-white/50 dark:bg-white/5'}
          backdrop-blur-sm flex items-center justify-center
        `}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Center Pivot */}
        <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
        
        {/* Needle/Indicator */}
        <div 
          className="absolute w-1/2 h-0.5 left-1/2 top-1/2 origin-left"
          style={{ 
            transform: `translate(0, -50%) rotate(${angle}deg)`,
          }}
        >
          <div className="w-full h-full bg-gradient-to-r from-primary/60 to-primary rounded-full" />
          {/* Knob at the end */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow-sm border border-white dark:border-neutral-800" />
        </div>

        {/* Degree Markers (Subtle) */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
          <div 
            key={deg}
            className="absolute w-1 h-1 rounded-full bg-black/10 dark:bg-white/10"
            style={{
              left: `${50 + 40 * Math.cos(deg * Math.PI / 180)}%`,
              top: `${50 + 40 * Math.sin(deg * Math.PI / 180)}%`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium text-muted-foreground select-none">
        {angle}°
      </span>
    </div>
  );
};
