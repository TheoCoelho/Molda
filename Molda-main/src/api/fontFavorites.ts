// src/api/fontFavorites.ts

/** Le favoritos no cache local. */
export async function fetchUserFavorites(): Promise<string[]> {
  return readLocal();
}

/** Adiciona favorito no cache local. */
export async function addFavoriteFont(family: string): Promise<{ ok: true }> {
  const fam = (family || "").trim();
  if (!fam) return { ok: true };

  writeLocal(toggleSet(readLocalSet(), fam, true));
  return { ok: true };
}

/** Remove favorito do cache local. */
export async function removeFavoriteFont(family: string): Promise<{ ok: true }> {
  const fam = (family || "").trim();
  if (!fam) return { ok: true };

  writeLocal(toggleSet(readLocalSet(), fam, false));
  return { ok: true };
}

/* ---------- Helpers de cache local (anônimo / offline / sem env) ---------- */

const LS_KEY = "font_favorites_local";

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY) || "[]";
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function readLocalSet(): Set<string> {
  return new Set(readLocal());
}

function writeLocal(set: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function toggleSet(set: Set<string>, family: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(family);
  else next.delete(family);
  return next;
}
