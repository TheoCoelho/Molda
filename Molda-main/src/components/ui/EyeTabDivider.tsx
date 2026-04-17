import React, { useState, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

interface EyeTabDividerProps {
    className?: string;
    isDragging?: boolean;
}

export function EyeTabDivider({ className, isDragging = false }: EyeTabDividerProps) {
    const [isHovered, setIsHovered] = useState(false);
    const active = isDragging || isHovered;

    const containerRef = useRef<HTMLDivElement>(null);
    const pupilRef = useRef<HTMLDivElement>(null);
    const reflectionRef = useRef<HTMLDivElement>(null);

    // Efeito para seguir o cursor quando estiver arrastando
    useEffect(() => {
        if (!isDragging) {
            // Remove o inline style ao soltar para a animação CSS assumir novamente
            if (pupilRef.current) pupilRef.current.style.transform = '';
            if (reflectionRef.current) reflectionRef.current.style.transform = '';
            return;
        }

        const handleMove = (e: MouseEvent | DragEvent) => {
            if (!containerRef.current || !pupilRef.current || !reflectionRef.current) return;

            let clientX = 0;
            let clientY = 0;

            if ('clientX' in e && e.clientX !== undefined) {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // DragEvents as vezes disparam 0,0 - ignoramos
            if (clientX === 0 && clientY === 0) return;

            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const deltaX = clientX - centerX;
            const deltaY = clientY - centerY;

            // Limita o percurso máximo da pupila em pixels
            const maxPupilX = 4.5;
            const maxPupilY = 7;
            const pupilX = Math.max(-maxPupilX, Math.min(maxPupilX, deltaX * 0.015));
            const pupilY = Math.max(-maxPupilY, Math.min(maxPupilY, deltaY * 0.015));

            // Move o reflexo numa taxa ligeiramente menor (parallax effect)
            const maxReflX = 3;
            const maxReflY = 4;
            const reflX = Math.max(-maxReflX, Math.min(maxReflX, deltaX * 0.01));
            const reflY = Math.max(-maxReflY, Math.min(maxReflY, deltaY * 0.01));

            pupilRef.current.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
            reflectionRef.current.style.transform = `translate(${reflX}px, ${reflY}px)`;
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('dragover', handleMove);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('dragover', handleMove);
            if (pupilRef.current) pupilRef.current.style.transform = '';
            if (reflectionRef.current) reflectionRef.current.style.transform = '';
        };
    }, [isDragging]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative flex items-center justify-center self-stretch w-4 mx-1 cursor-pointer group",
                className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title="Divisor de áreas"
        >
            {/* Linha estática central (linha vertical inativa) */}
            <div
                className={cn(
                    "absolute w-[2px] bg-foreground/40 h-8 transition-opacity duration-300",
                    active ? "opacity-0" : "opacity-100"
                )}
            />

            {/* Contorno do Olho (SVG perfeitamente arredondado e espesso) */}
            <svg
                className={cn(
                    "absolute transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    active ? "scale-x-100 opacity-100" : "scale-x-[0.01] opacity-0"
                )}
                width="20"
                height="36"
                viewBox="0 0 20 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M 10 2 Q 26 18 10 34 Q -6 18 10 2"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="text-foreground"
                />
            </svg>

            {/* Injeção de keyframes para o movimento leve da pupila */}
            <style>
                {`
                    @keyframes pupil-scan-vertical {
                        0%, 15% { transform: translateY(0px); }
                        30%, 45% { transform: translateY(-3.5px); }
                        60%, 75% { transform: translateY(3.5px); }
                        90%, 100% { transform: translateY(0px); }
                    }
                    @keyframes reflection-bounce {
                        0%, 100% { transform: translate(0px, 0px); }
                        33% { transform: translate(-4px, 1.5px); }
                        66% { transform: translate(-2px, 3px); }
                    }
                    .animate-pupil-custom {
                        animation: pupil-scan-vertical 12s ease-in-out infinite;
                    }
                    .animate-reflection-custom {
                        animation: reflection-bounce 4s ease-in-out infinite;
                    }
                `}
            </style>

            {/* Pupila com Reflexo de Luz e Movimento Leve */}
            <div
                ref={pupilRef}
                className={cn(
                    "absolute w-[12px] h-[12px] bg-foreground rounded-full transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] shadow-none flex items-start justify-end p-[2px]",
                    active ? "scale-100 opacity-100" : "scale-0 opacity-0",
                    !isDragging && active ? "animate-pupil-custom" : ""
                )}
            >
                {/* Ponto de luz (reflexo) branco/background */}
                <div
                    ref={reflectionRef}
                    className={cn(
                        "w-[3.5px] h-[3.5px] bg-background rounded-full",
                        !isDragging && active ? "animate-reflection-custom" : ""
                    )}
                />
            </div>
        </div>
    );
}
