// src/integrations/supabase/client.ts
// Reexport a singleton client to avoid multiple GoTrueClient instances.
import { getSupabase } from "../../lib/supabaseClient";

const instance = getSupabase();
if (!instance) {
  throw new Error(
    "Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (frontend .env)."
  );
}

export const supabase = instance;
