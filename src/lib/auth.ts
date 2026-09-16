import { supabase, supabaseConfigured } from './supabase';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SIGN-IN — MICROSOFT, THROUGH SUPABASE
 * ─────────────────────────────────────────────────────────────────────────
 *  Supabase owns the OAuth dance with Entra ID. It holds the client secret
 *  and does the token exchange server-side, so the browser never handles a
 *  credential and there is no MSAL in the bundle.
 *
 *  This also has to be Supabase's own session rather than a Microsoft token
 *  held on the side: row-level security identifies the user from the
 *  Supabase JWT, so without it every policy would see an anonymous caller
 *  and the data would be wide open to anyone reading the publishable key
 *  out of the JavaScript.
 *
 *  Sign-in is a full-page redirect. The response comes back as `?code=` in
 *  the query string, which never collides with HashRouter the way the old
 *  Microsoft fragment did.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const authConfigured = supabaseConfigured;

export interface MsUser {
  name: string;
  email: string;
}

function toUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): MsUser {
  const meta = user.user_metadata ?? {};
  const email = String(meta.email ?? user.email ?? '').toLowerCase();
  const name = String(meta.full_name ?? meta.name ?? email);
  return { name, email };
}

/** The signed-in user, or null. Also completes a redirect sign-in. */
export async function currentUser(): Promise<MsUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toUser(data.user);
}

/**
 * Starts sign-in by navigating this tab to Microsoft. The returned promise
 * never resolves with a user — the page is going away, and the session is
 * picked up by currentUser() on the way back.
 */
export async function signInWithMicrosoft(): Promise<MsUser | null> {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email openid profile',
      // Back to the app itself, at whatever path it's served from.
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
  return null; // navigating away
}

export async function signOutFromMicrosoft(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Kept for the app's startup path; Supabase needs no separate init. */
export function authReady(): Promise<void> {
  return Promise.resolve();
}
