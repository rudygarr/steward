import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

/**
 * Runs on auth.html — the page Microsoft redirects the sign-in popup to.
 *
 * MSAL v5 completes sign-in over a BroadcastChannel: this page reads the auth
 * response out of the URL, broadcasts it to the app window that opened the
 * popup, and closes itself.
 *
 * It is deliberately NOT the app. The app routes with HashRouter, which owns
 * the URL fragment the response arrives in; loading the app here produced a
 * second login screen in the popup instead of finishing sign-in.
 */
broadcastResponseToMainFrame().catch((e: unknown) => {
  // Nothing here can recover — the app window shows the error. Leave a trace
  // in the popup's console and a line on screen if it's still open.
  console.error('[steward] sign-in bridge failed', e);
  const el = document.getElementById('bridge-status');
  if (el) el.textContent = 'Sign-in could not be completed. Close this window and try again.';
});
