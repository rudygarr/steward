import {
  PublicClientApplication,
  InteractionRequiredAuthError,
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
 *  We use the POPUP flow with a dedicated redirect page (auth.html). The app
 *  routes with HashRouter, which owns the URL fragment the auth response
 *  arrives in, so the response must never land on an app page. auth.html
 *  runs MSAL's redirect bridge, which broadcasts the response back here over
 *  a BroadcastChannel and closes the popup.
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
        // A dedicated bridge page, NOT the app. MSAL sends the sign-in
        // response here; auth.html broadcasts it back to this window and
        // closes itself. Pointing this at the app instead loads the whole
        // SPA in the popup, where HashRouter owns the fragment the response
        // arrives in — which left the popup showing a second login screen.
        // Resolved relative to the app so it works at any base path.
        redirectUri: new URL('auth.html', window.location.href).href,
      },
      cache: {
        // Survives a refresh, unlike sessionStorage, so a presenter who
        // reloads mid-demo isn't bounced back to the splash.
        cacheLocation: 'localStorage',
      },
    })
  : null;

let ready: Promise<void> | null = null;
/** MSAL v3+ must be initialized before any other call. Runs once. */
function init(): Promise<void> {
  if (!msal) return Promise.resolve();
  ready ??= msal.initialize();
  return ready;
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

export async function signInWithMicrosoft(): Promise<MsUser> {
  if (!msal) throw new Error('Microsoft sign-in is not configured yet.');
  await init();
  const scopes = ['openid', 'profile', 'User.Read'];
  try {
    // Silent first: an already-signed-in staff member shouldn't see a popup.
    const [account] = msal.getAllAccounts();
    if (account) {
      await msal.acquireTokenSilent({ scopes, account });
      msal.setActiveAccount(account);
      return toUser(account);
    }
  } catch (e) {
    // Consent or MFA needed — fall through to the popup, which can prompt.
    if (!(e instanceof InteractionRequiredAuthError)) throw e;
  }
  const result = await msal.loginPopup({ scopes, prompt: 'select_account' });
  msal.setActiveAccount(result.account);
  return toUser(result.account);
}

export async function signOutFromMicrosoft(): Promise<void> {
  if (!msal) return;
  await init();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (!account) return;
  // popup, not redirect: same HashRouter reason as sign-in.
  await msal.logoutPopup({ account });
}
