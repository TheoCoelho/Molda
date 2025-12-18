import React from "react";

import type { PatternCategory, PatternDefinition } from "../lib/patterns";
import { PATTERN_LIBRARY } from "../lib/patterns";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "../lib/utils";

const CATEGORY_LABELS: Record<PatternCategory, string> = {
  animals: "Animais",
  geometric: "Geométrico",
  abstract: "Abstrato",
  floral: "Floral",
  custom: "Personalizado",
};

export interface PatternSubmenuProps {
  onSelectPattern: (pattern: PatternDefinition) => void;
  onPreviewStart?: (pattern: PatternDefinition) => void;
  onPreviewEnd?: () => void;
}

export function PatternSubmenu({ onSelectPattern, onPreviewStart, onPreviewEnd }: PatternSubmenuProps) {
  const patternsByCategory = React.useMemo(() => {
    const grouped: Record<PatternCategory, PatternDefinition[]> = {
      animals: [],
      geometric: [],
      abstract: [],
      floral: [],
      custom: [],
    };

    for (const pattern of PATTERN_LIBRARY) {
      grouped[pattern.category].push(pattern);
    }

    return grouped;
  }, []);

  return (
    <ScrollArea className="h-80 w-72 p-2">
      <div className="space-y-4">
        {(Object.keys(patternsByCategory) as PatternCategory[]).map((category) => {
          const patterns = patternsByCategory[category];
          if (!patterns.length) return null;
          return (
            <CategorySection
              key={category}
              label={CATEGORY_LABELS[category]}
              patterns={patterns}
              onSelectPattern={onSelectPattern}
              onPreviewStart={onPreviewStart}
              onPreviewEnd={onPreviewEnd}
            />
          );
        })}
      </div>
    </ScrollArea>
  );
}

function CategorySection({
  label,
  patterns,
  onSelectPattern,
  onPreviewStart,
  onPreviewEnd,
}: {
  label: string;
  patterns: PatternDefinition[];
  onSelectPattern: (pattern: PatternDefinition) => void;
  onPreviewStart?: (pattern: PatternDefinition) => void;
  onPreviewEnd?: () => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">{label}</h4>
      <div className="grid grid-cols-4 gap-2">
        {patterns.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            onClick={() => onSelectPattern(pattern)}
            onMouseEnter={() => onPreviewStart?.(pattern)}
            onMouseLeave={() => onPreviewEnd?.()}
            onFocus={() => onPreviewStart?.(pattern)}
            onBlur={() => onPreviewEnd?.()}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-md",
              "border-2 border-transparent hover:border-primary",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            )}
            title={pattern.name}
          >
            <img
              src={pattern.thumbnail}
              alt={pattern.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-xs text-white font-medium">{pattern.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
