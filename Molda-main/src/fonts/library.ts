// src/fonts/library.ts
export type FontItem = {
  id: string;
  family: string;
  source: 'google' | 'local';
  weights?: number[];
  styles?: Array<'normal' | 'italic'>;
  categories?: string[];
  previewText?: string;
};

// ➕ importa a lista GERADA automaticamente
import { GOOGLE_FONTS } from "./google-library";

// Biblioteca final = locais + todas do Google
export const FONT_LIBRARY: FontItem[] = [
  ...GOOGLE_FONTS
];

export type FontCategoryKey =
  | "sans-serif"
  | "serif"
  | "display"
  | "handwriting"
  | "monospace"
  | "other";

export type FontCategoryMeta = {
  key: FontCategoryKey;
  label: string;
  shortLabel: string;
  description: string;
  aliases: string[];
};

export type FontPresetKey = "common" | "stylized";

export type FontPresetMeta = {
  key: FontPresetKey;
  label: string;
  description: string;
  aliases: string[];
  categories: FontCategoryKey[];
};

export const FONT_CATEGORY_META: Record<FontCategoryKey, FontCategoryMeta> = {
  "sans-serif": {
    key: "sans-serif",
    label: "Sem serifa",
    shortLabel: "Sans",
    description: "Limpa, moderna e versatil para leitura e branding.",
    aliases: ["sans", "sans serif", "sem serifa", "moderna", "clean"],
  },
  serif: {
    key: "serif",
    label: "Com serifa",
    shortLabel: "Serif",
    description: "Mais editorial, classica e elegante.",
    aliases: ["serifada", "com serifa", "classica", "editorial", "elegante"],
  },
  display: {
    key: "display",
    label: "Display",
    shortLabel: "Display",
    description: "Chamativa para titulos, logos e destaque.",
    aliases: ["headline", "titulo", "impacto", "decorativa", "poster"],
  },
  handwriting: {
    key: "handwriting",
    label: "Manuscrita",
    shortLabel: "Script",
    description: "Mais humana, expressiva e artesanal.",
    aliases: ["script", "caligrafia", "cursiva", "handwritten", "manual"],
  },
  monospace: {
    key: "monospace",
    label: "Monoespacada",
    shortLabel: "Mono",
    description: "Tecnica, geometrica e com largura fixa.",
    aliases: ["mono", "codigo", "tech", "terminal", "largura fixa"],
  },
  other: {
    key: "other",
    label: "Outras",
    shortLabel: "Outras",
    description: "Fontes sem classificacao principal no catalogo.",
    aliases: ["outras", "diversas"],
  },
};

export const FONT_PRESET_META: Record<FontPresetKey, FontPresetMeta> = {
  common: {
    key: "common",
    label: "Uso comum",
    description: "Fontes mais neutras e funcionais para leitura, texto e uso recorrente.",
    aliases: ["comum", "normal", "neutra", "texto", "padrao", "uso comum"],
    categories: ["sans-serif", "serif", "monospace"],
  },
  stylized: {
    key: "stylized",
    label: "Estilizadas",
    description: "Fontes com personalidade mais forte, decorativas ou fora do padrao visual mais comum.",
    aliases: ["estilizada", "estilizadas", "decorativa", "fora do padrao", "diferente", "expressiva"],
    categories: ["display", "handwriting"],
  },
};

const FONT_CATEGORY_PRIORITY: FontCategoryKey[] = [
  "sans-serif",
  "serif",
  "display",
  "handwriting",
  "monospace",
  "other",
];

export function normalizeFontCategory(category?: string): FontCategoryKey {
  const normalized = (category || "").trim().toLowerCase();
  switch (normalized) {
    case "sans-serif":
    case "sans serif":
      return "sans-serif";
    case "serif":
      return "serif";
    case "display":
      return "display";
    case "handwriting":
    case "script":
      return "handwriting";
    case "monospace":
    case "mono":
      return "monospace";
    default:
      return "other";
  }
}

export function getFontPrimaryCategory(font: FontItem): FontCategoryKey {
  const firstCategory = Array.isArray(font.categories) ? font.categories[0] : undefined;
  return normalizeFontCategory(firstCategory);
}

export function getFontCategoryMeta(font: FontItem): FontCategoryMeta {
  return FONT_CATEGORY_META[getFontPrimaryCategory(font)];
}

export function fontMatchesPreset(font: FontItem, preset: FontPresetKey): boolean {
  return FONT_PRESET_META[preset].categories.includes(getFontPrimaryCategory(font));
}

export function listFontPresets(fonts: FontItem[]): FontPresetMeta[] {
  return Object.values(FONT_PRESET_META).filter((preset) =>
    fonts.some((font) => fontMatchesPreset(font, preset.key))
  );
}

export function listFontCategories(fonts: FontItem[]): FontCategoryMeta[] {
  const keys = new Set<FontCategoryKey>();
  for (const font of fonts) {
    keys.add(getFontPrimaryCategory(font));
  }

  return FONT_CATEGORY_PRIORITY.filter((key) => keys.has(key)).map((key) => FONT_CATEGORY_META[key]);
}

/**
 * Catálogo de fontes disponíveis no projeto.
 * - As "bundled" devem ter sido instaladas com @fontsource e importadas (ex.: main.tsx).
 * - As "google" serão carregadas sob demanda via WebFont Loader.
 * - As "local" devem ter @font-face registrado via CSS (ex.: /public/fonts + CSS global).
 */

/** Texto padrão para previews (fallback quando o item não definir previewText) */
export const DEFAULT_PREVIEW_TEXT =
  'A rápida raposa marrom saltou sobre o cão preguiçoso — 1234567890';
