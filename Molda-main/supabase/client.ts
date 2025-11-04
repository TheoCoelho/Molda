// Reexporta o singleton oficial usado no app (evita múltiplos GoTrueClient).
import { getSupabase } from "../src/lib/supabaseClient";

const instance = getSupabase();
if (!instance) {
  // Em produção, falhe cedo para evitar estados inconsistentes.
  // Em dev, também avisamos para facilitar configuração.
  throw new Error(
    "Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (configure em .env e reinicie o dev server)."
  );
}

export const supabase = instance;
