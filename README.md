# Ledger

Aplicación de finanzas personales que vive por completo en el navegador. Registras cuentas y movimientos, fijas presupuestos mensuales, importas tus extractos en CSV y ves a dónde se va el dinero, sin servidor, sin cuenta y sin enviar un solo dato a ningún lado.

Es un proyecto personal de portafolio, hecho para practicar arquitectura de software en el frontend: un dominio puro y testeable, una capa de almacenamiento intercambiable y una interfaz cuidada.

- Demo estática prevista: <https://juanxd2201.github.io/portfolio/labs/ledger/>
- Autor: Juan Esteban Olaya

![Panel en escritorio, tema claro](docs/screenshots/panel-escritorio-claro.png)

## Funcionalidades

**Cuentas y movimientos**
- Cuentas de efectivo, banco y tarjeta de crédito. El saldo siempre se calcula a partir de los movimientos; nunca se guarda un saldo "a mano".
- Gastos, ingresos y transferencias entre cuentas (el patrimonio total no cambia al transferir).
- Crear, editar y eliminar, con aviso para deshacer la eliminación.
- Categorías, etiquetas y notas.
- Búsqueda por texto (sin distinguir tildes), filtros por fecha, categoría, cuenta, tipo, etiqueta y rango de monto; orden por fecha o monto; paginación.

**Recurrentes**
- Reglas semanales o mensuales. Al abrir la app se generan los movimientos pendientes hasta hoy, sin duplicar nada.
- Las mensuales conservan el día original: una regla del 31 cae el 28 (o 29) en febrero y vuelve al 31 en marzo.

**Presupuestos**
- Un límite mensual por categoría, con barra de progreso, aviso al 80 % y alerta al 100 %. Gastar exactamente el límite ya cuenta como "límite alcanzado".
- Al guardar un gasto que cruza un umbral, la app te lo dice en el momento.

**Informes**
- Gasto por categoría (dona), flujo mensual de ingresos y gastos (barras), tendencia del patrimonio (línea con lectura por puntero y teclado) y comparación con el mes anterior.

**Datos**
- Importar CSV con validación fila a fila, vista previa, detección de duplicados, creación de categorías nuevas y reporte de errores descargable.
- Exportar CSV (que la propia app puede reimportar) y respaldo JSON validado al restaurar.
- Botones "Cargar datos de ejemplo" y "Empezar vacío". En la demo, el estado inicial ya viene lleno de datos de ejemplo.

**Experiencia**
- Moneda COP con `Intl.NumberFormat`, fechas en es-CO, tema claro y oscuro (respeta la preferencia del sistema).
- Atajos: `N` nuevo movimiento, `/` buscar, `G` y una letra para navegar, `T` tema, `?` ayuda.
- Estados vacíos, de carga y de error pensados uno por uno (incluido el caso de datos guardados corruptos).
- Accesibilidad: navegación completa por teclado, enlace para saltar al contenido, diálogos nativos con foco atrapado, roles ARIA, foco visible, contraste calculado de al menos 4,5:1 en los pares de color principales de ambos temas y `prefers-reduced-motion`.
- Responsive: barra lateral en escritorio y navegación inferior con botón flotante en móvil; la tabla de movimientos se convierte en lista de tarjetas.

## Capturas

| Movimientos | Presupuestos |
| --- | --- |
| ![Movimientos](docs/screenshots/movimientos-escritorio-claro.png) | ![Presupuestos](docs/screenshots/presupuestos-escritorio-claro.png) |

| Informes | Importación de CSV |
| --- | --- |
| ![Informes](docs/screenshots/informes-escritorio-claro.png) | ![Importación](docs/screenshots/importacion-escritorio-claro.png) |

Tema oscuro: [panel](docs/screenshots/panel-escritorio-oscuro.png), [movimientos](docs/screenshots/movimientos-escritorio-oscuro.png), [presupuestos](docs/screenshots/presupuestos-escritorio-oscuro.png), [informes](docs/screenshots/informes-escritorio-oscuro.png), [importación](docs/screenshots/importacion-escritorio-oscuro.png).
Móvil (390 × 844): [panel](docs/screenshots/panel-movil.png), [movimientos](docs/screenshots/movimientos-movil.png), [presupuestos](docs/screenshots/presupuestos-movil.png), [informes](docs/screenshots/informes-movil.png), [importación](docs/screenshots/importacion-movil.png).

## Stack

- Vite + React 19 + TypeScript en modo estricto (`noUncheckedIndexedAccess` incluido).
- Sin backend: sitio estático, persistencia en `localStorage` con esquema versionado y migración.
- Gráficos en SVG propio (sin librerías de gráficos).
- Tipografías autoalojadas con Fontsource: Fraunces (titulares), Source Sans 3 (texto) e IBM Plex Mono (cifras tabulares).
- Jest + ts-jest para el dominio; Playwright (`playwright-core` con el Chrome instalado) para e2e.
- Dependencias de ejecución: `react`, `react-dom` y las tres fuentes. Nada más.

## Instalación y scripts

Requiere Node 20 o superior (desarrollado y probado con Node 25).

```bash
npm install
npm run dev          # servidor de desarrollo
npm run build        # comprueba tipos y genera dist/
npm run preview      # sirve dist/ en http://127.0.0.1:4173
npm run typecheck    # tsc --noEmit
npm test             # pruebas de dominio con Jest
npm run test:e2e     # e2e con Playwright sobre dist/ (requiere build previo)
npm run capturas     # regenera docs/screenshots/ desde el build
```

Las pruebas e2e y las capturas usan Chrome ya instalado (`C:/Program Files/Google/Chrome/Application/chrome.exe` en Windows); `playwright-core` no descarga navegadores. Si tu Chrome está en otra ruta, ajusta `CHROME_PATHS` en `e2e/lib.mjs`.

## Estructura

```
src/
  domain/        Tipos y funciones puras: saldos, presupuestos, recurrencias,
                 agregaciones, filtros, CSV, esquema/migración, datos de ejemplo
  storage/       Interfaz LedgerRepository e implementación sobre localStorage
  ui/
    components/  Modal, formulario de movimientos, tabla, piezas comunes
    charts/      Dona, barras y línea de tendencia en SVG
    pages/       Panel, Movimientos, Presupuestos, Informes, Cuentas, Datos
    store.tsx    Estado, persistencia y acciones
  test/          Pruebas Jest del dominio y del repositorio
e2e/             Pruebas Playwright y script de capturas
docs/            ARQUITECTURA.md y capturas
```

La explicación completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Decisiones técnicas

- **Dinero en enteros.** Los montos son pesos enteros; el COP no usa centavos en la práctica y así se evitan errores de coma flotante. Las comparaciones de presupuesto usan aritmética entera (`gastado * 100 >= límite * 80`).
- **Saldos derivados.** Una cuenta guarda solo su saldo inicial. El saldo actual sale de recorrer los movimientos, de modo que editar o borrar un movimiento nunca deja saldos inconsistentes.
- **Fechas como texto ISO.** Los movimientos guardan `AAAA-MM-DD`, sin hora ni zona. Evita el clásico desfase de un día por zona horaria y permite comparar fechas como cadenas.
- **Recurrencias idempotentes.** Cada movimiento generado tiene un identificador determinista (`rec-<regla>-<fecha>`) y la regla recuerda hasta dónde generó. Abrir la app mil veces produce el mismo resultado.
- **Esquema versionado.** Lo guardado lleva `schemaVersion`. Al leer se migra (hoy v1 → v2) y se valida estructura e integridad referencial. Si los datos están corruptos no se tocan: la app ofrece descargar una copia antes de reiniciar.
- **Navegación por hash.** `#/movimientos` funciona desde cualquier subruta de GitHub Pages sin configuración de servidor, y `base: './'` hace que los recursos carguen con rutas relativas.
- **CSV defensivo.** Parser propio con comillas, saltos de línea internos, separador `,` `;` o tabulación y BOM. La exportación neutraliza celdas que empiezan por `=`, `+` o `@` para evitar inyección de fórmulas al abrir el archivo en una hoja de cálculo.
- **Sin datos reales en el código.** No hay `.env`, claves ni llamadas de red; las fuentes van empaquetadas.

## Pruebas

Última ejecución completa:

| Tipo | Resultado |
| --- | --- |
| Verificación de tipos (`npx tsc --noEmit`) | sin errores |
| Jest, dominio y repositorio | 93 pruebas en 6 archivos, todas pasan |
| Playwright e2e sobre el build de producción | 22 pruebas, todas pasan |
| `npm run build` | `dist/` de 665 KB (JS 315 KB, 96 KB comprimido) |

Las pruebas de dominio cubren, entre otras cosas: años bisiestos y fin de mes, recurrencias del día 31, transferencias y pago de tarjeta, presupuesto justo por debajo del 80 %, en el 80 % y en el 100 %, CSV con comillas y saltos de línea, comillas sin cerrar, fechas imposibles, duplicados dentro del archivo y contra lo existente, ida y vuelta del respaldo y migración v1 → v2.

Los e2e recorren flujos reales: crear, editar y eliminar con deshacer, validaciones del formulario, transferencias, alerta de presupuesto al superar el límite, filtros y paginación, importar CSV (vista previa, errores y duplicados), exportar, respaldo y restauración, tema oscuro, persistencia tras recargar, recurrentes, atajos, foco, informes, ausencia de desbordes en móvil, datos corruptos y migración de datos antiguos. Todas verifican además que la consola no registre errores.

## Demo estática

`npm run build` deja en `dist/` un sitio estático listo para cualquier alojamiento. En GitHub Pages se publicará en `https://juanxd2201.github.io/portfolio/labs/ledger/`. Como todo usa rutas relativas y navegación por hash, no necesita reglas de reescritura.

Los datos de cada persona quedan solo en su navegador. Este es un proyecto demostrativo, no un producto financiero.
