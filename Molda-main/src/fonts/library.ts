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

/**
 * Catálogo de fontes disponíveis no projeto.
 * - As "bundled" devem ter sido instaladas com @fontsource e importadas (ex.: main.tsx).
 * - As "google" serão carregadas sob demanda via WebFont Loader.
 * - As "local" devem ter @font-face registrado via CSS (ex.: /public/fonts + CSS global).
 */

/** Texto padrão para previews (fallback quando o item não definir previewText) */
export const DEFAULT_PREVIEW_TEXT =
  'A rápida raposa marrom saltou sobre o cão preguiçoso — 1234567890';
