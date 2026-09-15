import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base + HashRouter so the build works on GitHub Pages at any path.
export default defineConfig({
  base: './',
  plugins: [react()],
})
