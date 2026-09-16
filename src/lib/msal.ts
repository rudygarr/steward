import {
  PublicClientApplication,
  BrowserAuthError,
  BrowserAuthErrorCodes,
  type AccountInfo,
} from '@azure/msal-browser';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MICROSOFT ENTRA ID SIGN-IN
 * ─────────────────────────────────────────────────────────────────────────
 *  Steward is a static single-page app on GitHub Pages: there is no server
 *  to hold a client secret, so this uses the SPA flow (authorization code
 *  + PKCE). The client and tenant IDs below are NOT secrets — they ship in
 *  the bundle by design, which is why they're build-time `vars`, not
 *  repository secrets.
 *
 *  We use the REDIRECT flow, not a popup. A popup depends on the browser
 *  allowing it and on window.opener surviving — neither held up in practice,
 *  and a blocked popup is indistinguishable from nothing happening. A
 *  redirect navigates the whole tab to Microsoft and back, so there is no
 *  popup blocker, no opener, and it works in an installed PWA window.
 *
 *  Coming back, the response rides in the URL fragment — which HashRouter
 *  also owns. handleRedirectPromise() below runs during init, before any
 *  router mounts, so MSAL consumes the response first.
 * ─────────────────────────────────────────────────────────────────────────
 */

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? '';
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? '';

/** False until IT hands over an app registration; the UI explains the gap. */
export const msalConfigured = Boolean(clientId && tenantId);

const msal = msalConfigured
  ? new PublicClientApplication({
      auth: {
        clientId,
        // Single-tenant: only WCS accounts, so nobody outside the school can
        // sign in even though the URL is public.
        authority: `https://login.microsoftonline.com/${tenantId}`,
        // The app's own URL — the one redirect URI already registered in
        // Entra. main.tsx detects the auth response arriving here and runs
        // MSAL's redirect bridge instead of mounting the app, so no extra
        // redirect URI has to be registered for sign-in to work.
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: {
        // Survives a refresh, unlike sessionStorage, so a presenter who
        // reloads mid-demo isn't bounced back to the splash.
        cacheLocation: 'localStorage',
      },
    })
  : null;

let ready: Promise<void> | null = null;
/**
 * MSAL v3+ must be initialized before any other call. Runs once, and also
 * completes a redirect sign-in if this load is the trip back from Microsoft.
 */
function init(): Promise<void> {
  if (!msal) return Promise.resolve();
  ready ??= msal.initialize().then(async () => {
    const result = await msal!.handleRedirectPromise();
    if (result?.account) msal!.setActiveAccount(result.account);
  });
  return ready;
}

/**
 * Await MSAL startup — which includes consuming a redirect response if this
 * load is the trip back from Microsoft. The app awaits this before mounting,
 * so MSAL reads the URL fragment before HashRouter takes ownership of it.
 */
export function msalReady(): Promise<void> {
  return init();
}

export interface MsUser {
  name: string;
  email: string;
}

function toUser(a: AccountInfo): MsUser {
  return {
    name: a.name ?? a.username,
    // `username` is the UPN — the school address we match staff on.
    email: (a.username ?? '').toLowerCase(),
  };
}

/** A previously signed-in account, restored on load. Null if none. */
export async function currentUser(): Promise<MsUser | null> {
  if (!msal) return null;
  await init();
  const [account] = msal.getAllAccounts();
  if (!account) return null;
  msal.setActiveAccount(account);
  return toUser(account);
}

const SCOPES = ['openid', 'profile', 'User.Read'];

/**
 * Starts sign-in. Either returns an already-valid session, or navigates this
 * tab to Microsoft — in which case the returned promise never settles, because
 * the page is going away. The account is picked up by init() on the way back.
 */
export async function signInWithMicrosoft(): Promise<MsUser | null> {
  if (!msal) throw new Error('Microsoft sign-in is not configured yet.');
  await init();

  // Silent first: an already-signed-in staff member shouldn't leave the page.
  // Any failure here only means we need the full redirect — never fatal.
  const [existing] = msal.getAllAccounts();
  if (existing) {
    try {
      await msal.acquireTokenSilent({ scopes: SCOPES, account: existing });
      msal.setActiveAccount(existing);
      return toUser(existing);
    } catch {
      // fall through to the redirect
    }
  }

  try {
    await msal.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
  } catch (e) {
    // A sign-in abandoned part-way leaves MSAL's "interaction in progress"
    // flag set in storage, and that flag then blocks every later attempt with
    // no way out from the UI. Clear it and retry rather than asking someone
    // to wipe site data.
    if (
      e instanceof BrowserAuthError &&
      e.errorCode === BrowserAuthErrorCodes.interactionInProgress
    ) {
      msal.clearCache();
      await msal.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
    } else {
      throw e;
    }
  }
  return null; // navigating away
}

export async function signOutFromMicrosoft(): Promise<void> {
  if (!msal) return;
  await init();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (!account) return;
  await msal.logoutRedirect({ account });
}
