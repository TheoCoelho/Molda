/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string
  // adicione aqui outras variáveis VITE_* que você usar
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
