// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type AnyEnv = Record<string, any>;

function readEnv() {
  const im: AnyEnv = (typeof import.meta !== "undefined" && (import.meta as any).env) || {};
  const pe: AnyEnv = (typeof process !== "undefined" && (process as any).env) || {};
  const gt: AnyEnv = (typeof globalThis !== "undefined" ? (globalThis as any) : {}) || {};

  const url =
    im.VITE_SUPABASE_URL ||
    pe.NEXT_PUBLIC_SUPABASE_URL ||
    pe.VITE_SUPABASE_URL ||
    gt.VITE_SUPABASE_URL ||
    "";

  const key =
    im.VITE_SUPABASE_ANON_KEY ||
    pe.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    pe.VITE_SUPABASE_ANON_KEY ||
    gt.VITE_SUPABASE_ANON_KEY ||
    "";

  return { url, key };
}

const GLOBAL_KEY = "__molda_supabase_client__";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const globalClient = typeof globalThis !== "undefined" ? ((globalThis as any)[GLOBAL_KEY] as SupabaseClient | undefined) : undefined;
  if (globalClient) {
    _client = globalClient;
    return _client;
  }

  const { url, key } = readEnv();
  if (!url || !key) {
    console.warn(
      "[supabaseClient] Variáveis do Supabase ausentes. " +
        "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_* em Next.js) " +
        "no .env da *raiz do app frontend* e reinicie o dev server."
    );
    return null;
  }

  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (typeof globalThis !== "undefined") {
    (globalThis as any)[GLOBAL_KEY] = _client;
  }

  return _client;
}

export const STORAGE_BUCKET = "user-uploads";
