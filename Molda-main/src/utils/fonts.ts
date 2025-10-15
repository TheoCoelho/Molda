// src/utils/fonts.ts
// Utilitários de carregamento de fontes para uso com fabric.js e a UI.
// Mudanças principais:
// - Não cachear promessas rejeitadas (evita "queimar" a família após um erro momentâneo)
// - Restringir variantes pedidas a um conjunto seguro (weights válidos, styles válidos)
// - Fallback via <link> com &display=swap e espera robusta em document.fonts
// - Função auxiliar wantVariantsFor(family) que tenta respeitar metadados do catálogo (opcional)

import type { FontItem } from "../fonts/library"; // se não existir, ajuste o caminho
import { FONT_LIBRARY } from "../fonts/library";

type FontStyle = "normal" | "italic";

type EnsureOpts = {
  weights?: number[];
  styles?: FontStyle[];
  text?: string;
};

const fontLoadCache = new Map<string, Promise<void>>();

/** Evita perpetuar falhas no cache e permite retry posterior */
function setCacheSafe(key: string, p: Promise<void>) {
  fontLoadCache.set(
    key,
    p.catch((err) => {
      fontLoadCache.delete(key);
      throw err;
    })
  );
}

/** Sanitiza pesos e estilos solicitados */
function sanitizeVariants(weights?: number[], styles?: FontStyle[]) {
  const w = (weights && weights.length ? weights : [400])
    .filter((x) => Number.isFinite(x))
    .map((x) => Math.max(100, Math.min(1000, Math.round(x / 50) * 50)))
    .filter((x, i, a) => a.indexOf(x) === i)
    .sort((a, b) => a - b);

  const s = (styles && styles.length ? styles : ["normal"]).filter(
    (st): st is FontStyle => st === "normal" || st === "italic"
  );

  return { weights: w.length ? w : [400], styles: s.length ? s : ["normal"] };
}

/** Tenta obter variantes sugeridas pelo catálogo */
export function wantVariantsFor(family: string): EnsureOpts {
  const item: FontItem | undefined = FONT_LIBRARY?.find(
    (f) => f.family.toLowerCase() === family.toLowerCase()
  );

  const styles: FontStyle[] = [];
  if (item?.styles?.includes("italic")) styles.push("italic");
  styles.push("normal");

  let weights: number[] = [400];
  if (Array.isArray(item?.weights) && item!.weights!.length) {
    // apenas pesos clássicos, evita eixos malucos
    const classic = item!.weights!.filter((w: number) =>
      [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].includes(w)
    );
    if (classic.length) weights = Array.from(new Set([400, 700, ...classic]))
      .filter((w) => w >= 100 && w <= 1000)
      .sort((a, b) => a - b);
  } else {
    weights = [400, 700];
  }

  return { weights, styles: Array.from(new Set(styles)) };
}

/** Carrega a família para uso em canvas/DOM; resiliente e com fallback. */
export async function ensureFontForFabric(
  family: string,
  provider: "google" | "local" = "google",
  opts?: EnsureOpts
) {
  const { weights, styles } = sanitizeVariants(opts?.weights, opts?.styles);
  const key = `${provider}:${family}:${weights.join(",")}:${styles.join(",")}`;

  const cached = fontLoadCache.get(key);
  if (cached) return cached;

  const p = (async () => {
    // 1) tenta webfontloader
    let usedWFL = false;
    try {
      const WebFont = (await import(/* @vite-ignore */ "webfontloader")).default;
      await new Promise<void>((resolve, reject) => {
        const families: string[] = [];
        if (styles.includes("italic")) {
          // ital,wght@0,400;0,700;1,400;1,700
          const w0 = weights.map((w) => `0,${w}`).join(";");
          const w1 = weights.map((w) => `1,${w}`).join(";");
          families.push(`${family}:ital,wght@${w0};${w1}`);
        } else {
          families.push(`${family}:wght@${weights.join(";")}`);
        }
        WebFont.load({
          google: {
            families,
          },
          active: () => resolve(),
          inactive: () => reject(new Error("WebFontLoader inactive")),
        });
      });
      usedWFL = true;
    } catch {
      // segue para fallback
    }

    // 2) fallback via <link> com &display=swap
    if (!usedWFL) {
      const id = `gfont-${family.replace(/\s+/g, "-").toLowerCase()}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        const hasItalic = styles.includes("italic");
        const axis = hasItalic
          ? `ital,wght@0,${weights.join(";0,")};1,${weights.join(";1,")}`
          : `wght@${weights.join(";")}`;
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
          family
        )}:${axis}&display=swap`;
        document.head.appendChild(link);
      }

      // 3) espera variantes no document.fonts (com timeout hard)
      const toLoad: string[] = [];
      for (const st of styles) {
        for (const w of weights) {
          toLoad.push(`${st === "italic" ? "italic " : ""}${w} 1em "${family}"`);
        }
      }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("font load timeout")), 7000)
      );

      await Promise.race([
        Promise.allSettled(
          toLoad.map((desc) => (document as any).fonts.load(desc))
        ).then((res) => {
          const ok = res.some((r) => r.status === "fulfilled");
          if (!ok) throw new Error("no font variants resolved");
        }),
        timeout,
      ]);

      await (document as any).fonts.ready.catch(() => {});
    }
  })();

  setCacheSafe(key, p);
  return p;
}

/** Back-compat alias, caso algum lugar use esse nome */
export const loadFontFamily = ensureFontForFabric;

/** Opcional: garante uma fonte básica antes do editor subir */
export async function ensureBasicFontReady() {
  try {
    await ensureFontForFabric("Inter", "google", { weights: [400, 700], styles: ["normal"] });
  } catch {
    // silencioso; swap cobre depois
  }
}
