export type PatternCategory = "animals" | "geometric" | "abstract" | "floral" | "custom";

export interface PatternDefinition {
  id: string;
  name: string;
  category: PatternCategory;
  source: string;
  thumbnail: string;
  repeat: "repeat" | "repeat-x" | "repeat-y" | "no-repeat";
  defaultScale?: number;
}

export const PATTERN_LIBRARY: PatternDefinition[] = [
  {
    id: "leopard",
    name: "Leopardo",
    category: "animals",
    source: "/textures/animals/leopard.svg",
    thumbnail: "/textures/animals/leopard.svg",
    repeat: "repeat",
    defaultScale: 0.5,
  },
  {
    id: "checker",
    name: "Xadrez",
    category: "geometric",
    source: "/textures/geometric/checker.svg",
    thumbnail: "/textures/geometric/checker.svg",
    repeat: "repeat",
    defaultScale: 0.3,
  },
  {
    id: "waves",
    name: "Ondas",
    category: "abstract",
    source: "/textures/abstract/waves.svg",
    thumbnail: "/textures/abstract/waves.svg",
    repeat: "repeat",
    defaultScale: 0.45,
  },
];

export function getPatternsByCategory(category: PatternCategory): PatternDefinition[] {
  return PATTERN_LIBRARY.filter((p) => p.category === category);
}

export function getAllPatternCategories(): PatternCategory[] {
  const categories = new Set(PATTERN_LIBRARY.map((p) => p.category));
  return Array.from(categories);
}
