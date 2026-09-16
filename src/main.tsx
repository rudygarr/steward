import './index.css'

/**
 * Two different jobs load this entry:
 *
 *  1. The app itself.
 *  2. Microsoft's sign-in popup, which redirects back to this same URL with
 *     the auth response in it.
 *
 * Sign-in is a full-page redirect, so case 2 is normally THIS window coming
 * back from Microsoft: we let MSAL consume the response before mounting,
 * because HashRouter would otherwise take ownership of the fragment first.
 *
 * MSAL also renews tokens silently in a hidden iframe, which loads this same
 * URL. There we must not mount the app at all — we run MSAL's redirect
 * bridge, which hands the response back and tears the frame down.
 *
 * Both branches are dynamic imports, so those transient loads pull a few KB
 * rather than the whole application.
 */
const hasAuthResponse = /[#&?](code|error|state|id_token|access_token)=/.test(
  window.location.hash + window.location.search,
)
const inPopup = Boolean(window.opener) && window.opener !== window
const inIframe = window.parent !== window

if (hasAuthResponse && (inPopup || inIframe)) {
  const { broadcastResponseToMainFrame } = await import('@azure/msal-browser/redirect-bridge')
  broadcastResponseToMainFrame().catch((e: unknown) => {
    console.error('[steward] sign-in bridge failed', e)
    document.body.innerHTML =
      '<p style="font:14px system-ui;color:#8b8b8b;text-align:center;margin-top:40vh">' +
      'Sign-in could not be completed. Close this window and try again.</p>'
  })
} else {
  // Coming back from a redirect sign-in, let MSAL consume the response from
  // the URL before the app — and therefore HashRouter — mounts.
  if (hasAuthResponse) {
    const { msalReady } = await import('./lib/msal')
    await msalReady().catch((e: unknown) => console.error('[steward] sign-in failed', e))
  }

  const [{ StrictMode }, { createRoot }, { default: App }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App.tsx'),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // Register the service worker so Steward is installable + works offline.
  // Never from the sign-in popup — that window is transient.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
    })
  }
}
