import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: el sitio funciona desde cualquier subruta (p. ej. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
});
