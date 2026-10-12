import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the static build works from any path (e.g. GitHub Pages /echoes/).
export default defineConfig({
  base: './',
  plugins: [react()],
})
