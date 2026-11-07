// Pruebas e2e con playwright-core sobre el build de producción (dist/ servido con vite preview).
// Cada prueba usa un contexto limpio (sin localStorage) y falla si la consola registra errores.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, iso, launch, newPage, ROOT, startPreview, writeTmp } from './lib.mjs';

const tests = [];
const test = (name, fn, options) => tests.push({ name, fn, options });

const go = async (page, route) => {
  await page.evaluate((r) => (window.location.hash = `#/${r}`), route);
  await page.waitForSelector('.main h1');
};
const newMovement = (page) => page.getByRole('button', { name: 'Nuevo movimiento' }).first().click();
const count = async (page) => Number(await page.getByTestId('conteo').innerText());
const search = async (page, text) => {
  await go(page, 'movimientos');
  await page.getByLabel('Buscar movimientos').fill(text);
};

async function addExpense(page, { amount, note, category }) {
  await newMovement(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Monto (COP)').fill(amount);
  if (category) await dialog.getByLabel('Categoría').selectOption({ label: category });
  await dialog.getByLabel('Nota').fill(note);
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await page.locator('.toast').first().waitFor();
}

test('los datos de ejemplo cargados desde la bienvenida muestran el panel completo', async (page) => {
  await page.waitForSelector('[data-testid="patrimonio"]');
  assert.match(await page.getByTestId('patrimonio').innerText(), /\$\s?[\d.]+/);
  assert.ok((await page.getByTestId('tx-row').count()) >= 5);
  assert.ok(await page.getByRole('heading', { name: 'Presupuestos en alerta' }).isVisible());
});

test('crear un movimiento lo deja visible y actualiza el total', async (page) => {
  await go(page, 'movimientos');
  const before = await count(page);
  await addExpense(page, { amount: '12345', note: 'Café de prueba e2e', category: 'Restaurantes' });
  await search(page, 'Café de prueba e2e');
  assert.equal(await count(page), 1);
  assert.equal(await page.getByTestId('tx-row').first().locator('.num').innerText(), '−$ 12.345');
  await page.getByLabel('Buscar movimientos').fill('');
  assert.equal(await count(page), before + 1);
});

test('el formulario explica los errores y no guarda datos inválidos', async (page) => {
  await newMovement(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await dialog.getByText('Ingresa un monto mayor que cero.').waitFor();
  assert.equal(await dialog.getByLabel('Monto (COP)').getAttribute('aria-invalid'), 'true');
  await dialog.getByRole('radio', { name: 'Transferencia' }).click();
  await dialog.getByLabel('Monto (COP)').fill('5000');
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await dialog.getByText('Elige la cuenta de destino.').waitFor();
});

test('una transferencia mueve saldo entre cuentas sin cambiar el patrimonio', async (page) => {
  const before = await page.getByTestId('patrimonio').innerText();
  const accounts = await page.locator('.ledger-rows').nth(1).innerText();
  await newMovement(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Transferencia' }).click();
  await dialog.getByLabel('Monto (COP)').fill('100000');
  await dialog.getByLabel('Desde la cuenta').selectOption({ label: 'Cuenta de ahorros' });
  await dialog.getByLabel('Hacia la cuenta').selectOption({ label: 'Efectivo' });
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await page.locator('.toast').first().waitFor();
  assert.equal(await page.getByTestId('patrimonio').innerText(), before);
  assert.notEqual(await page.locator('.ledger-rows').nth(1).innerText(), accounts);
});

test('la alerta de presupuesto aparece al superar el límite', async (page) => {
  await go(page, 'presupuestos');
  assert.ok(await page.getByTestId('presupuesto-cat-restaurantes').getByText('Presupuesto superado').isVisible());
  assert.ok(await page.getByTestId('presupuesto-cat-mercado').getByText('Cerca del límite').isVisible());
  await addExpense(page, { amount: '400000', note: 'Salida grande e2e', category: 'Ocio' });
  const toast = await page.locator('.toast').first().innerText();
  assert.match(toast, /Presupuesto de Ocio/);
  assert.match(toast, /superado/);
  await go(page, 'presupuestos');
  const ocio = page.getByTestId('presupuesto-cat-ocio');
  assert.ok(await ocio.getByText('Presupuesto superado').isVisible());
  assert.ok(Number(await ocio.getByRole('progressbar').getAttribute('aria-valuenow')) >= 100);
});

test('eliminar un movimiento permite deshacerlo', async (page) => {
  await go(page, 'movimientos');
  const before = await count(page);
  await page.getByTestId('tx-row').first().getByRole('button', { name: /^Eliminar/ }).click();
  await page.getByRole('button', { name: 'Deshacer' }).waitFor();
  assert.equal(await count(page), before - 1);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  assert.equal(await count(page), before);
});

test('editar un movimiento guarda los cambios', async (page) => {
  await go(page, 'movimientos');
  await page.getByTestId('tx-row').first().getByRole('button', { name: /^Editar/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nota').fill('Nota editada e2e');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await search(page, 'Nota editada e2e');
  assert.equal(await count(page), 1);
});

test('filtros por tipo, monto y paginación', async (page) => {
  await go(page, 'movimientos');
  const total = await count(page);
  assert.ok(total > 12);
  assert.match(await page.getByText(/Página 1 de/).innerText(), /Página 1 de \d+/);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  assert.match(await page.getByText(/Página 2 de/).innerText(), /Página 2/);
  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByLabel('Tipo').selectOption('income');
  assert.ok((await count(page)) < total);
  await page.getByLabel('Monto mínimo').fill('99999999');
  await page.getByText('Ningún movimiento coincide').waitFor();
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
  assert.equal(await count(page), total);
});

const importCsv = (accountOk = 'Efectivo') =>
  [
    'fecha,tipo,monto,cuenta,cuenta_destino,categoria,etiquetas,nota',
    `${iso(new Date(2026, 0, 10))},gasto,15000,${accountOk},,Mercado,e2e,e2e-uno`,
    `${iso(new Date(2026, 0, 11))},ingreso,250000,${accountOk},,Freelance,,e2e-dos`,
    `11/01/2026,gasto,9.500,${accountOk},,Mascotas,mascota,e2e-tres`,
    `2026-02-31,gasto,1000,${accountOk},,Mercado,,e2e-malo`,
  ].join('\n');

test('importar CSV: vista previa, errores, importación y duplicados', async (page) => {
  await go(page, 'movimientos');
  const before = await count(page);
  await go(page, 'datos');
  await page.setInputFiles('[data-testid="archivo-csv"]', writeTmp('e2e.csv', importCsv()));
  const preview = page.getByTestId('vista-previa');
  await preview.waitFor();
  assert.match(await preview.innerText(), /4\s+filas leídas/);
  assert.match(await preview.innerText(), /1\s+con errores/);
  assert.ok(await preview.getByText(/Línea 5:.*fecha inválida/).isVisible());
  assert.ok(await preview.getByText(/Mascotas/).first().isVisible());
  await page.getByRole('button', { name: 'Importar 3 movimientos' }).click();
  await page.locator('.toast').first().waitFor();
  await go(page, 'movimientos');
  assert.equal(await count(page), before + 3);
  // segunda importación: todo es duplicado
  await go(page, 'datos');
  await page.setInputFiles('[data-testid="archivo-csv"]', writeTmp('e2e.csv', importCsv()));
  await page.getByTestId('vista-previa').waitFor();
  assert.match(await page.getByTestId('vista-previa').innerText(), /3\s+posibles duplicados/);
  assert.ok(await page.getByRole('button', { name: 'Importar 0 movimientos' }).isDisabled());
});

test('importar un archivo con encabezados incorrectos muestra el error', async (page) => {
  await go(page, 'datos');
  await page.setInputFiles('[data-testid="archivo-csv"]', writeTmp('mal.csv', 'a,b,c\n1,2,3'));
  await page.getByRole('alert').getByText(/Faltan columnas obligatorias/).waitFor();
});

test('exportar CSV descarga un archivo reimportable', async (page) => {
  await go(page, 'datos');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar movimientos' }).click()]);
  assert.match(download.suggestedFilename(), /^ledger-movimientos-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync(await download.path(), 'utf8');
  assert.ok(text.includes('fecha,tipo,monto,cuenta,cuenta_destino,categoria,etiquetas,nota'));
  assert.ok(text.split('\n').length > 100);
});

test('respaldo JSON: descargar, vaciar y restaurar; rechaza archivos inválidos', async (page) => {
  await go(page, 'datos');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar respaldo' }).click()]);
  const file = await download.path();
  await page.getByRole('button', { name: 'Empezar vacío' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, empezar vacío' }).click();
  await go(page, 'panel');
  await page.getByText('Todavía no hay movimientos').waitFor();
  await go(page, 'datos');
  await page.setInputFiles('[data-testid="archivo-json"]', writeTmp('roto.json', '{"app":"ledger","schemaVersion":2,"data":{"accounts":"x"}}'));
  await page.getByText('No se pudo restaurar el respaldo.').waitFor();
  await page.setInputFiles('[data-testid="archivo-json"]', file);
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar' }).click();
  await go(page, 'panel');
  await page.waitForSelector('[data-testid="patrimonio"]');
});

test('el tema oscuro se aplica y persiste tras recargar', async (page) => {
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  assert.equal(await theme(), 'claro');
  await page.getByRole('button', { name: 'Tema oscuro' }).first().click();
  assert.equal(await theme(), 'oscuro');
  await page.reload();
  await page.waitForSelector('.main');
  assert.equal(await theme(), 'oscuro');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 23, 19)');
});

test('los datos persisten tras recargar la página', async (page) => {
  await addExpense(page, { amount: '77777', note: 'Persistencia e2e', category: 'Mercado' });
  await page.reload();
  await page.waitForSelector('.main');
  await search(page, 'Persistencia e2e');
  assert.equal(await count(page), 1);
});

test('empezar vacío y registrar el primer movimiento', async (page) => {
  await go(page, 'datos');
  await page.getByRole('button', { name: 'Empezar vacío' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, empezar vacío' }).click();
  await go(page, 'movimientos');
  await page.getByText('Aún no hay movimientos').waitFor();
  await addExpense(page, { amount: '5000', note: 'Primero', category: 'Mercado' });
  await page.reload();
  await page.waitForSelector('.main');
  await go(page, 'movimientos');
  assert.equal(await count(page), 1);
});

test('un movimiento recurrente genera los pagos pendientes sin duplicarlos', async (page) => {
  await go(page, 'cuentas');
  await page.getByRole('button', { name: 'Nuevo recurrente' }).click();
  const dialog = page.getByRole('dialog');
  const start = new Date();
  start.setMonth(start.getMonth() - 3, 1);
  await dialog.getByLabel('Nombre').fill('Gimnasio e2e');
  await dialog.getByLabel('Monto (COP)').fill('80000');
  await dialog.getByLabel('Empieza el').fill(iso(start));
  await dialog.getByRole('button', { name: 'Crear recurrente' }).click();
  await page.locator('.toast').first().waitFor();
  await search(page, 'Gimnasio e2e');
  assert.equal(await count(page), 4);
  await page.reload();
  await page.waitForSelector('.main');
  await search(page, 'Gimnasio e2e');
  assert.equal(await count(page), 4);
});

test('atajos de teclado: n abre el formulario, Esc lo cierra, g m navega', async (page) => {
  await page.keyboard.press('n');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => undefined);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await page.waitForFunction(() => location.hash === '#/movimientos');
  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement?.id === 'buscar');
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 700, y: 20 } });
  await page.keyboard.press('?');
  await page.getByRole('dialog', { name: 'Atajos de teclado' }).waitFor();
});

test('navegación por teclado: foco visible y diálogo que atrapa el foco', async (page) => {
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip');
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  for (let i = 0; i < 14; i += 1) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))));
  assert.equal(await page.evaluate(() => document.querySelector('nav a[aria-current="page"]')?.textContent?.trim()), 'Panel');
});

test('informes muestra dona, barras y tendencia con alternativas accesibles', async (page) => {
  await go(page, 'informes');
  assert.ok((await page.locator('svg[role="img"]').count()) >= 3);
  assert.match((await page.locator('svg.donut').getAttribute('aria-label')) ?? '', /Gasto por categoría/);
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  assert.ok(await page.getByRole('table').isVisible());
});

test('en móvil hay navegación inferior y ninguna página desborda horizontalmente', async (page) => {
  assert.ok(await page.locator('.bottom-nav').isVisible());
  assert.equal(await page.locator('.sidebar').isVisible(), false);
  for (const route of ['panel', 'movimientos', 'presupuestos', 'informes', 'cuentas', 'datos', 'ajustes']) {
    await go(page, route);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `desborde horizontal de ${overflow}px en #/${route}`);
  }
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('si los datos guardados están corruptos se muestra un error recuperable', async (page) => {
  await page.evaluate(() => localStorage.setItem('ledger.datos', '{rotos'));
  await page.reload();
  await page.getByRole('alert').getByText('No pudimos leer tus datos guardados').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger.datos')), '{rotos');
}, { allowConsole: true });

test('datos de una versión anterior (v1) se migran al abrir', async (page) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'ledger.datos',
      JSON.stringify({
        schemaVersion: 1,
        data: {
          accounts: [{ id: 'a1', name: 'Banco viejo', type: 'bank', openingBalance: 500000 }],
          categories: [{ id: 'c1', name: 'Mercado', kind: 'expense' }],
          transactions: [{ id: 't1', date: '2026-01-05', type: 'expense', amount: 20000, accountId: 'a1', categoryId: 'c1' }],
        },
      }),
    );
  });
  await page.reload();
  await page.waitForSelector('[data-testid="patrimonio"]');
  assert.match(await page.getByTestId('patrimonio').innerText(), /480\.000/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ledger.datos')).schemaVersion), 2);
});

// ---------------- Primera ejecución, ajustes, presupuestos por mes, informe anual ----------------
test('primera ejecución: bienvenida sin lenguaje de demostración y la elección se recuerda', async (page) => {
  const text = await page.locator('.welcome').innerText();
  assert.ok(text.includes('Empezar con una base vacía') && text.includes('Cargar datos de ejemplo'));
  assert.equal(/demo|demostra/i.test(text), false, 'la bienvenida no debe hablar de demostración');
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger.datos')), null);
  await page.getByTestId('empezar-vacio').click();
  await page.getByText('Todavía no hay movimientos').waitFor();
  await page.reload();
  await page.waitForSelector('.main');
  assert.equal(await page.locator('.welcome').count(), 0);
  await page.getByText('Todavía no hay movimientos').waitFor();
}, { welcome: true });

test('primera ejecución con datos de ejemplo: se guardan y no vuelve la bienvenida', async (page) => {
  await page.getByTestId('cargar-ejemplo').click();
  await page.waitForSelector('[data-testid="patrimonio"]');
  await page.reload();
  await page.waitForSelector('[data-testid="patrimonio"]');
  assert.equal(await page.locator('.welcome').count(), 0);
}, { welcome: true });

test('ningún texto visible habla de demostración en ninguna pantalla', async (page) => {
  for (const route of ['panel', 'movimientos', 'presupuestos', 'informes', 'cuentas', 'datos', 'ajustes']) {
    await go(page, route);
    const text = await page.locator('body').innerText();
    assert.equal(/demo|demostra/i.test(text), false, `texto de demostración en #/${route}`);
  }
});

test('ajustes: titular, moneda fija, versión y respaldo', async (page) => {
  await go(page, 'ajustes');
  assert.match(await page.getByTestId('version').innerText(), /^\d+\.\d+\.\d+$/);
  assert.ok(await page.getByText('Peso colombiano (COP)').isVisible());
  await page.getByLabel('Nombre del titular').fill('Juan Esteban');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await page.locator('.toast').first().waitFor();
  await go(page, 'panel');
  assert.match(await page.locator('.page-head__lead').innerText(), /^Juan Esteban, así va tu dinero/);
  await page.reload();
  await page.waitForSelector('.main');
  assert.match(await page.locator('.page-head__lead').innerText(), /Juan Esteban/);
  await go(page, 'ajustes');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar respaldo' }).click()]);
  assert.match(download.suggestedFilename(), /^ledger-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
  assert.equal(backup.app, 'ledger');
  assert.ok(backup.data.transactions.length > 50);
});

test('borrar todos los datos exige confirmar, limpia el navegador y vuelve a la bienvenida', async (page) => {
  await go(page, 'ajustes');
  await page.getByLabel('Nombre del titular').fill('Prueba');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await page.getByRole('button', { name: /Borrar todos los datos…/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Borrar todos los datos' });
  const confirmBtn = dialog.getByRole('button', { name: 'Borrar definitivamente' });
  assert.ok(await confirmBtn.isDisabled());
  await dialog.getByLabel(/Escribe/).fill('borrar');
  assert.ok(await confirmBtn.isDisabled(), 'la palabra distingue mayúsculas');
  await dialog.getByLabel(/Escribe/).fill('BORRAR');
  await confirmBtn.click();
  await page.waitForSelector('.welcome');
  const left = await page.evaluate(() => ({ datos: localStorage.getItem('ledger.datos'), ajustes: localStorage.getItem('ledger.ajustes') }));
  assert.deepEqual(left, { datos: null, ajustes: null });
  await page.reload();
  await page.waitForSelector('.welcome');
});

test('presupuestos por mes: ajuste propio, copia al mes siguiente y quitar ajustes', async (page) => {
  await go(page, 'presupuestos');
  const month = (await page.locator('.month-picker__label').innerText()).trim();
  const base = page.getByTestId('presupuesto-cat-ocio');
  assert.match(await base.innerText(), /300\.000/);
  await base.getByRole('button', { name: /Editar presupuesto/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Límite de/).fill('450000');
  await dialog.getByRole('button', { name: 'Guardar presupuesto' }).click();
  assert.match(await base.innerText(), /450\.000/);
  assert.ok(await base.getByText('ajustado este mes').isVisible());
  await page.getByTestId('copiar-mes').click();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  assert.notEqual((await page.locator('.month-picker__label').innerText()).trim(), month);
  assert.match(await page.getByTestId('presupuesto-cat-ocio').innerText(), /450\.000/);
  // quitar los ajustes del mes siguiente no toca el mes de origen
  await page.getByRole('button', { name: 'Quitar ajustes de este mes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar ajustes' }).click();
  assert.match(await page.getByTestId('presupuesto-cat-ocio').innerText(), /300\.000/);
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  assert.match(await page.getByTestId('presupuesto-cat-ocio').innerText(), /450\.000/);
});

test('informe anual: totales del año y selector de año', async (page) => {
  await go(page, 'informes');
  const section = page.getByTestId('informe-anual');
  await section.waitFor();
  assert.match(await section.getByTestId('anual-gastos').innerText(), /\$\s?[\d.]+/);
  assert.equal(await section.locator('svg[role="img"]').count(), 1);
  assert.ok(await section.getByRole('button', { name: 'Año siguiente' }).isDisabled());
  await section.getByRole('button', { name: 'Año anterior' }).click();
  await section.getByRole('button', { name: 'Año siguiente' }).click();
});

// ---------------- Aplicación instalable y sin conexión ----------------
test('PWA: manifiesto válido, iconos y service worker activo', async (page) => {
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').getAttribute('href');
    const res = await fetch(href);
    return { href, json: await res.json() };
  });
  assert.equal(manifest.href, './manifest.webmanifest');
  assert.equal(manifest.json.display, 'standalone');
  assert.equal(manifest.json.start_url, './');
  assert.equal(manifest.json.scope, './');
  assert.ok(manifest.json.icons.some((i) => i.sizes === '192x192') && manifest.json.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of manifest.json.icons) {
    const ok = await page.evaluate(async (src) => (await fetch(src)).ok, icon.src);
    assert.ok(ok, 'falta el icono ' + icon.src);
  }
  await page.evaluate(() => navigator.serviceWorker.ready);
  assert.ok(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.active))));
});

test('PWA sin conexión: tras la primera carga, la app abre, navega y guarda sin red', async (page, context) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.main');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('[data-testid="patrimonio"]');
  await go(page, 'presupuestos');
  await go(page, 'informes');
  assert.ok((await page.locator('svg[role="img"]').count()) >= 3);
  assert.ok(await page.evaluate(() => document.fonts.check('16px "Fraunces Variable"')));
  await addExpense(page, { amount: '4321', note: 'Sin conexión e2e', category: 'Mercado' });
  await search(page, 'Sin conexión e2e');
  assert.equal(await count(page), 1);
  await context.setOffline(false);
});

test('PWA: una versión nueva muestra «Hay una versión nueva» y Recargar la activa', async (page) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.main');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const swFile = join(ROOT, 'dist', 'sw.js');
  const original = readFileSync(swFile, 'utf8');
  try {
    writeFileSync(swFile, original.replace(/const CACHE = PREFIX \+ '[0-9a-f]+'/, "const CACHE = PREFIX + 'zzz-nueva'"));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.getByTestId('aviso-actualizacion').waitFor();
    assert.match(await page.getByTestId('aviso-actualizacion').innerText(), /Hay una versión nueva/);
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Recargar' }).click()]);
    await page.waitForSelector('.main');
    assert.equal(await page.getByTestId('aviso-actualizacion').count(), 0);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['ledger-zzz-nueva']);
  } finally {
    writeFileSync(swFile, original);
  }
});

test('el botón «Instalar aplicación» aparece cuando el navegador lo permite', async (page) => {
  assert.equal(await page.getByRole('button', { name: 'Instalar aplicación' }).count(), 0);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  const btn = page.getByRole('button', { name: 'Instalar aplicación' }).first();
  await btn.waitFor();
  await btn.click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('Instalar aplicación')));
});

// ---------------- ejecución ----------------
const server = await startPreview();
const browser = await launch();
let passed = 0;
const failures = [];

for (const t of tests) {
  const { context, page, problems } = await newPage(browser, { viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...(t.options ?? {}) });
  try {
    await page.goto(BASE);
    if (t.options?.welcome) await page.waitForSelector('.welcome');
    else {
      await page.getByTestId('cargar-ejemplo').click();
      await page.waitForSelector('.main');
    }
    await t.fn(page, context);
    const real = problems.filter(() => !t.options?.allowConsole);
    assert.deepEqual(real, [], `errores de consola: ${real.join(' | ')}`);
    passed += 1;
    console.log(`  ok   ${t.name}`);
  } catch (e) {
    failures.push(t.name);
    console.log(`  FAIL ${t.name}\n       ${String(e.message).split('\n').slice(0, 4).join('\n       ')}`);
    await page.screenshot({ path: `e2e/.tmp/fallo-${failures.length}.png` }).catch(() => undefined);
  } finally {
    await context.close();
  }
}

await browser.close();
server.stop();
console.log(`\ne2e: ${passed} de ${tests.length} pruebas pasaron.`);
process.exit(failures.length ? 1 : 0);
