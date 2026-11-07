import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaPlugin } from './pwa-plugin';

// base relativa: el sitio funciona desde cualquier subruta (p. ej. GitHub Pages).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: './',
  plugins: [react(), pwaPlugin('ledger')],
  build: { target: 'es2020', sourcemap: false },
});
