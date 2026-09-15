/// <reference types="vite/client" />

// Build-time config for Microsoft Entra ID sign-in. Both are public values
// that ship in the bundle (see lib/msal) — repository *variables*, not secrets.
interface ImportMetaEnv {
  readonly VITE_ENTRA_CLIENT_ID?: string;
  readonly VITE_ENTRA_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
