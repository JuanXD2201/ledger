// Utilidades compartidas de las pruebas e2e y de las capturas.
// Se usa playwright-core con el Chrome ya instalado; no se descarga ningún navegador.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = 'http://127.0.0.1:4173/';
export const TMP = join(ROOT, 'e2e', '.tmp');

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

export function chromePath() {
  const found = CHROME_PATHS.find((p) => existsSync(p));
  if (!found) throw new Error('No se encontró Chrome en las rutas habituales de Windows.');
  return found;
}

export function ensureTmp() {
  mkdirSync(TMP, { recursive: true });
  return TMP;
}

export function writeTmp(name, content) {
  ensureTmp();
  const file = join(TMP, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

/** Sirve dist/ con `vite preview` y espera a que responda. */
export async function startPreview() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('Falta dist/. Ejecuta primero `npm run build`.');
  const child = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return { stop: () => child.kill() };
    } catch {
      /* aún no responde */
    }
    if (child.exitCode !== null) throw new Error(`vite preview terminó: ${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`vite preview no respondió a tiempo: ${log}`);
}

export async function launch() {
  return chromium.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
}

/** Contexto nuevo con registro de errores de consola y de página. */
export async function newPage(browser, options = {}) {
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true, ...options });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  return { context, page, problems };
}

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
