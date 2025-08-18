/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // adicione aqui outras variáveis VITE_* que você usar
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
