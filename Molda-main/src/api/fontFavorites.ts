// src/api/fontFavorites.ts
import { getSupabase } from "../lib/supabaseClient";

/** Lê favoritos do usuário logado; se não houver login ou Supabase indisponível, devolve cache local */
export async function fetchUserFavorites(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) {
    // sem env do supabase → usa cache local
    return readLocal();
  }

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr) {
    console.warn("[fontFavorites] auth.getUser error:", userErr);
    return readLocal();
  }
  if (!user) {
    // anônimo
    return readLocal();
  }

  const { data, error } = await sb
    .from("font_favorites")
    .select("family")
    .order("family", { ascending: true });

  if (error) {
    console.warn("[fontFavorites] select error:", error);
    return readLocal();
  }

  return (data ?? []).map((r) => r.family);
}

/** Adiciona favorito; se anônimo ou Supabase indisponível, salva em localStorage */
export async function addFavoriteFont(family: string): Promise<{ ok: true }> {
  const fam = (family || "").trim();
  if (!fam) return { ok: true };

  const sb = getSupabase();
  if (!sb) {
    writeLocal(toggleSet(readLocalSet(), fam, true));
    return { ok: true };
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    writeLocal(toggleSet(readLocalSet(), fam, true));
    return { ok: true };
  }

  const { error } = await sb
    .from("font_favorites")
    .upsert({ family: fam }, { onConflict: "user_id,family", ignoreDuplicates: false });
  if (error) {
    console.warn("[fontFavorites] upsert error:", error);
    // fallback local para não perder UX
    writeLocal(toggleSet(readLocalSet(), fam, true));
  }
  return { ok: true };
}

/** Remove favorito; se anônimo ou Supabase indisponível, remove de localStorage */
export async function removeFavoriteFont(family: string): Promise<{ ok: true }> {
  const fam = (family || "").trim();
  if (!fam) return { ok: true };

  const sb = getSupabase();
  if (!sb) {
    writeLocal(toggleSet(readLocalSet(), fam, false));
    return { ok: true };
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    writeLocal(toggleSet(readLocalSet(), fam, false));
    return { ok: true };
  }

  const { error } = await sb
    .from("font_favorites")
    .delete()
    .eq("family", fam);

  if (error) {
    console.warn("[fontFavorites] delete error:", error);
    // fallback local para não perder UX
    writeLocal(toggleSet(readLocalSet(), fam, false));
  }
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
