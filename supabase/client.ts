/// <reference types="vite/client" />

import { createClient } from "@supabase/supabase-js";

// Preferido (com tipos do Vite carregados):
const supabaseUrl =
  (import.meta as ImportMeta).env?.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey =
  (import.meta as ImportMeta).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

// Fallback à prova de tipeira (caso o TS ignore a linha acima):
// Isso evita o erro no editor mesmo se o tsserver não carregar os tipos do Vite.
const _envAny = (import.meta as any)?.env as Record<string, string> | undefined;
const _urlFallback = _envAny?.VITE_SUPABASE_URL;
const _keyFallback = _envAny?.VITE_SUPABASE_ANON_KEY;

const url = supabaseUrl ?? _urlFallback;
const key = supabaseAnonKey ?? _keyFallback;

if (!url || !key) {
  if (import.meta.env?.DEV) {
    console.warn(
      "Supabase env não configuradas. Recursos de auth/dados ficarão desabilitados (DEV)."
    );
  } else {
    throw new Error(
      "Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY"
    );
  }
}

export const supabase = createClient(
  url ?? "http://localhost:54321",
  key ?? "dev-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
