import { createClient } from '@supabase/supabase-js';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SUPABASE CLIENT
 * ─────────────────────────────────────────────────────────────────────────
 *  The URL and publishable key are PUBLIC — they ship in the bundle by
 *  design. They are not what protects the data: row-level security is.
 *  Every table allows access only to the `authenticated` role, so these
 *  values are useless without a signed-in WCS account.
 * ─────────────────────────────────────────────────────────────────────────
 */

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** False until the project is wired up; the UI explains the gap. */
export const supabaseConfigured = Boolean(url && key);

export const supabase = supabaseConfigured
  ? createClient(url, key, {
      auth: {
        // The sign-in response comes back as ?code= in the query string, not
        // the fragment, so it never collides with HashRouter the way the
        // Microsoft redirect did.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
