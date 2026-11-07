// Genera los iconos PNG de la aplicación (192, 512, maskable y apple-touch) desde SVG propios.
// Uso: node scripts/iconos.mjs   (necesita Chrome instalado, igual que las pruebas e2e)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chromePath } from '../e2e/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const BG = '#1f4d3a';
const mark = `<path d="M10 7v15h12" fill="none" stroke="#f5f0e4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 26h12" stroke="#c9602f" stroke-width="2.5" stroke-linecap="round"/>`;
// «any»: esquinas redondeadas. «maskable»: fondo a sangre y contenido dentro de la zona segura (80 %).
const svgAny = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${BG}"/>${mark}</svg>`;
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BG}"/><g transform="translate(16 16) scale(0.78) translate(-16 -16)">${mark}</g></svg>`;
writeFileSync(join(ROOT, 'public', 'icon.svg'), svgAny + '\n');

const jobs = [
  ['icon-192.png', 192, svgAny],
  ['icon-512.png', 512, svgAny],
  ['maskable-512.png', 512, svgMaskable],
  ['apple-touch-icon.png', 180, svgMaskable],
];
const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
for (const [name, size, svg] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(OUT, name), omitBackground: true });
  await page.close();
  console.log('icono:', name);
}
await browser.close();
