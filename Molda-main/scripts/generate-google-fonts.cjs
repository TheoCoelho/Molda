// scripts/generate-google-fonts.cjs
// Requer Node >=18 (fetch nativo). Usa GOOGLE_FONTS_API_KEY do ambiente.
// Saída: src/fonts/google-library.ts

const fs = require("fs/promises");
const path = require("path");

const API_KEY = process.env.GOOGLE_FONTS_API_KEY;
if (!API_KEY) {
  console.error("Erro: defina GOOGLE_FONTS_API_KEY no ambiente.");
  process.exit(1);
}

const API_URL = `https://www.googleapis.com/webfonts/v1/webfonts?key=${API_KEY}&sort=alpha`;

function parseVariants(variants) {
  // variants: ["regular","italic","700","700italic",...]
  const weights = new Set();
  const styles = new Set();
  for (const v of variants || []) {
    const isItalic = v.toLowerCase().includes("italic");
    styles.add(isItalic ? "italic" : "normal");

    const m = v.match(/\d+/);
    const w = m ? parseInt(m[0], 10) : 400; // "regular" => 400
    weights.add(w);
  }
  // Garantir ao menos normal/400
  if (weights.size === 0) weights.add(400);
  if (styles.size === 0) styles.add("normal");
  return {
    weights: Array.from(weights).sort((a, b) => a - b),
    styles: Array.from(styles)
  };
}

(async function main() {
  const res = await fetch(API_URL);
  if (!res.ok) {
    console.error("Falha ao consultar Google Fonts API:", res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const items = data.items || [];

  const mapped = items.map((f) => {
    const { weights, styles } = parseVariants(f.variants);
    return {
      id: `google:${f.family}`,
      family: f.family,
      source: "google",
      weights,
      styles, // "normal" | "italic"
      // categorias do Google vêm em singular (ex: "sans-serif")
      categories: f.category ? [f.category] : [],
      // opcional: preview
      previewText: undefined
    };
  });

  const header =
    `// ⚠️ GERADO AUTOMATICAMENTE — NÃO EDITAR À MÃO
// Execute: npm run generate:fonts
// Total de famílias: ${mapped.length}
export type FontItem = {
  id: string;
  family: string;
  source: 'google' | 'local';
  weights?: number[];
  styles?: Array<'normal' | 'italic'>;
  categories?: string[];
  previewText?: string;
};
`;

  const body =
    `export const GOOGLE_FONTS: FontItem[] = ${JSON.stringify(mapped, null, 2)};\n`;

  const outDir = path.resolve(process.cwd(), "src", "fonts");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "google-library.ts");
  await fs.writeFile(outFile, header + body, "utf8");
  console.log(`Gerado: ${outFile}`);
})();
