/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API, ending in /api. Defaults to /api on this origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
