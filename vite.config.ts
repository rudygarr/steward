import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Relative base + HashRouter so the build works on GitHub Pages at any path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // The app.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // The Microsoft sign-in redirect target. A separate page on purpose:
        // the auth response arrives in the URL fragment, which HashRouter owns
        // in the app. See src/auth-bridge.ts.
        auth: fileURLToPath(new URL('./auth.html', import.meta.url)),
      },
    },
  },
})
