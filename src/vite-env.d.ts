/// <reference types="vite/client" />

// Supabase connection (see lib/supabase). Both are PUBLIC values that ship in
// the bundle — row-level security is what protects the data, not these — so
// they're repository *variables*, not secrets.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
