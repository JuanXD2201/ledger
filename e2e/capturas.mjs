// Capturas reales de la aplicación (build de producción) en docs/screenshots.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, iso, launch, newPage, ROOT, startPreview, writeTmp } from './lib.mjs';

const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const now = new Date();
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 5);
const csv = [
  'fecha,tipo,monto,cuenta,cuenta_destino,categoria,etiquetas,nota',
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 12))},gasto,86500,Tarjeta de crédito,,Mercado,hogar,Compra de fin de semana`,
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 14))},gasto,42000,Efectivo,,Restaurantes,,Almuerzo familiar`,
  `${iso(prev)},gasto,1350000,Cuenta de ahorros,,Vivienda,hogar,Arriendo del apartamento`,
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 20))},ingreso,450000,Cuenta de ahorros,,Freelance,freelance,Proyecto de landing`,
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 21))},transferencia,150000,Cuenta de ahorros,Efectivo,,,Retiro`,
  `31/02/2026,gasto,30000,Efectivo,,Mercado,,Fecha imposible`,
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 22))},gasto,abc,Efectivo,,Mercado,,Monto con texto`,
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 23))},gasto,18000,Billetera,,Transporte,,Cuenta inexistente`,
  `${iso(new Date(now.getFullYear(), now.getMonth() - 1, 24))},gasto,64000,Tarjeta de crédito,,Mascotas,mascota,Veterinario`,
].join('\n');

const server = await startPreview();
const browser = await launch();
const problems = [];

async function shoot(page, name, { full = true } = {}) {
  // escritorio: página completa; móvil: la pantalla tal como se ve en el teléfono
  await page.waitForTimeout(1100); // deja terminar la animación de barras
  const vp = page.viewportSize();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (full && vp && vp.width > 880) await page.setViewportSize({ width: vp.width, height });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  if (vp) await page.setViewportSize(vp);
  console.log('captura:', name);
}

async function session(label, options, steps) {
  const { context, page, problems: p } = await newPage(browser, options);
  await page.goto(BASE);
  await page.waitForSelector('.main');
  await steps(page);
  problems.push(...p.map((x) => `[${label}] ${x}`));
  await context.close();
}

async function recorrido(page, theme, suffix, viewportLabel) {
  const go = async (hash) => {
    await page.evaluate((h) => (window.location.hash = h), hash);
    await page.waitForSelector('.main h1');
    await page.waitForTimeout(150);
  };
  await go('#/panel');
  await shoot(page, `panel-${suffix}`);
  await go('#/movimientos');
  await shoot(page, `movimientos-${suffix}`);
  await go('#/presupuestos');
  await shoot(page, `presupuestos-${suffix}`);
  await go('#/informes');
  await shoot(page, `informes-${suffix}`);
  await go('#/datos');
  await page.setInputFiles('[data-testid="archivo-csv"]', writeTmp('importar.csv', csv));
  await page.waitForSelector('[data-testid="vista-previa"]');
  await shoot(page, `importacion-${suffix}`);
  void theme; void viewportLabel;
}

await session('escritorio-claro', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, (p) => recorrido(p, 'claro', 'escritorio-claro'));
await session('escritorio-oscuro', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, async (p) => {
  await p.evaluate(() => localStorage.setItem('ledger.tema', 'oscuro'));
  await p.reload();
  await p.waitForSelector('.main');
  await recorrido(p, 'oscuro', 'escritorio-oscuro');
});
await session('movil', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' }, (p) => recorrido(p, 'claro', 'movil'));

await browser.close();
server.stop();
if (problems.length) {
  console.error('Problemas de consola:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Sin errores de consola.');
