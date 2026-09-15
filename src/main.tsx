import './index.css'

/**
 * Two different jobs load this entry:
 *
 *  1. The app itself.
 *  2. Microsoft's sign-in popup, which redirects back to this same URL with
 *     the auth response in it.
 *
 * They share a URL because the redirect URI has to be one Entra already
 * trusts, and this one is it. In the popup we must NOT mount the app — it
 * routes with HashRouter, which owns the fragment the response arrives in.
 * Instead we run MSAL's redirect bridge, which broadcasts the response to the
 * window that opened the popup and closes it.
 *
 * Both branches are dynamic imports, so the popup pulls in a few KB of bridge
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
