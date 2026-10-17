import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build --mode artifact` makes one JS chunk so the page can be inlined into a single HTML file.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build:
    mode === 'artifact'
      ? { outDir: 'dist-artifact', chunkSizeWarningLimit: 2000, rolldownOptions: { output: { codeSplitting: false } } }
      : { chunkSizeWarningLimit: 700 },
}))
