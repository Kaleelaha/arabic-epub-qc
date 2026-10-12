import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// esnext target: pdfjs-dist 4.x uses top-level await.
export default defineConfig({
  plugins: [react()],
  build: { target: 'esnext' },
  worker: { format: 'es' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
