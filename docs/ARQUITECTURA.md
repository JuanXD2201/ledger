# Arquitectura de Ledger

Ledger se divide en tres capas con dependencias en una sola dirección: la interfaz conoce al dominio y al almacenamiento; el almacenamiento conoce al dominio; el dominio no conoce a nadie.

```
 ui (React)  ──►  storage (repositorio)  ──►  domain (funciones puras)
     └──────────────────────────────────────────►
```

## Dominio (`src/domain`)

Funciones puras y tipos, sin DOM ni efectos. Corre y se prueba en Node.

| Módulo | Responsabilidad |
| --- | --- |
| `types.ts` | Cuentas, categorías, movimientos, recurrentes, presupuestos y el agregado `LedgerData`. |
| `dates.ts` | Fechas ISO sin zona horaria: validación, suma de días, desplazar meses, día ancla con ajuste a fin de mes. |
| `money.ts` | Interpretación de montos escritos a mano o venidos de un CSV (`1.234.567`, `$ 85.000`, `1234,50`). |
| `balances.ts` | Efecto de cada movimiento sobre una cuenta y saldos por cuenta o a una fecha. |
| `recurrence.ts` | Ocurrencias, generación de pendientes e idempotencia. |
| `budgets.ts` | Niveles (`ok`, `warning` al 80 %, `exceeded` al 100 %) y estado mensual por categoría. |
| `aggregates.ts` | Gasto por categoría, flujo mensual, tendencia del patrimonio y comparación entre meses. |
| `filters.ts` | Filtros, orden estable, paginación y normalización de etiquetas. |
| `csv.ts` | Parser, plan de importación (válidas, errores, duplicados, categorías nuevas) y exportación. |
| `schema.ts` | Versión del esquema, migraciones, validación estructural y referencial, respaldo JSON. |
| `validation.ts` | Validación del formulario de movimientos con mensajes listos para mostrar. |
| `seed.ts` | Datos de ejemplo deterministas, relativos a la fecha actual. |
| `format.ts` | Formato COP y fechas es-CO con `Intl`. |

### Modelo de datos

- **Cuenta**: `id`, `name`, `type` (`cash`, `bank`, `credit`) y `openingBalance`. En una tarjeta, un valor negativo es deuda.
- **Movimiento**: `type` (`income`, `expense`, `transfer`), `amount` positivo, `date` ISO, `accountId`, y según el tipo `categoryId` o `toAccountId`. El signo lo da el tipo, no el monto.
- **Recurrente**: plantilla de ingreso o gasto con frecuencia semanal o mensual, fecha de inicio, fin opcional y `generatedThrough`.
- **Presupuesto**: `categoryId` y `limit` mensual.

### Reglas que conviene recordar

- Las transferencias no cuentan como ingreso ni como gasto en presupuestos ni informes; solo mueven saldo entre cuentas.
- Una recurrente mensual calcula cada fecha desde el día original (`addMonthsClamped(inicio, k, díaAncla)`), por lo que no acumula desvíos tras febrero.
- `applyRecurring` devuelve el mismo objeto si no hay nada nuevo que generar; la UI se apoya en eso para no volver a guardar.
- Borrar un movimiento generado por una regla no lo regenera mientras la regla conserve `generatedThrough`.

## Almacenamiento (`src/storage`)

`LedgerRepository` define `load`, `save` y `clear`. `load` devuelve uno de tres estados: `empty` (primera visita), `ok` (con aviso si hubo migración) o `error` (con la lista de problemas y el texto original, para poder descargarlo).

`LocalStorageRepository` implementa la interfaz sobre cualquier objeto con forma de `Storage`. Eso permite probarlo en Node con un `MemoryStore` y usar memoria como respaldo si el navegador bloquea `localStorage`. Pasar a IndexedDB significaría escribir otra clase con la misma interfaz, sin tocar la UI.

El sobre guardado es `{ schemaVersion, data }`. Al leer:

1. Se rechazan versiones futuras con un mensaje claro.
2. `migrate` lleva los datos hasta la versión actual (v1 → v2 añade etiquetas, color de categoría, recurrentes y presupuestos).
3. `validateData` comprueba tipos, rangos, identificadores únicos y referencias entre entidades.
4. Si hubo migración, se reescribe ya migrado.

El respaldo JSON usa el mismo sobre más `app: "ledger"` y `exportedAt`, por lo que restaurar y arrancar comparten el mismo camino de validación.

## Interfaz (`src/ui`)

- `store.tsx` contiene `LedgerProvider`. Carga desde el repositorio (estados de carga y de error), aplica las recurrentes, guarda tras cada cambio y expone acciones (`addTransaction`, `importData`, `replaceAll`…). Los componentes no tocan el repositorio.
- `toast.tsx` ofrece avisos con acción opcional (por ejemplo, "Deshacer").
- `hooks.ts` resuelve la navegación por hash, el tema y la detección de campos de texto para los atajos.
- `pages/` tiene una pantalla por ruta: Panel, Movimientos, Presupuestos, Informes, Cuentas y Datos.
- `components/` agrupa lo compartido: `Modal` (elemento `<dialog>` nativo, con foco atrapado y cierre con Esc), `TransactionForm`, `TxTable` y piezas como la barra de progreso o el selector de mes.
- `charts/` dibuja dona, barras y línea en SVG. Miden el ancho real del contenedor para que los textos sean legibles en móvil, llevan `role="img"` con una descripción completa y títulos nativos en cada elemento.

### Sistema visual

Papel marfil, verde bosque y terracota. Los titulares usan Fraunces; el texto, Source Sans 3; las cifras, IBM Plex Mono con números tabulares. La referencia es el libro contable: filas con reglas finas y doble raya bajo cada total. Los ingresos van en verde, los gastos en terracota y las alertas en ámbar, siempre acompañadas de texto o icono para no depender solo del color. El tema oscuro redefine las mismas variables CSS (`:root[data-theme='oscuro']`). La única animación no solicitada es el llenado de las barras de presupuesto, y se desactiva con `prefers-reduced-motion`.

## Pruebas

- **Jest** (`src/test`): 93 pruebas sobre el dominio y el repositorio, en entorno Node, sin DOM.
- **Playwright** (`e2e`): 22 pruebas sobre `dist/` servido con `vite preview`, usando Chrome ya instalado a través de `playwright-core`. `e2e/capturas.mjs` genera las imágenes de `docs/screenshots` con el mismo build.

## Límites conocidos

- Un solo dispositivo: no hay sincronización entre navegadores. Para mover los datos, el respaldo JSON.
- Moneda única (COP) y sin decimales.
- `localStorage` tiene un límite de unos 5 MB; con miles de movimientos conviene migrar el repositorio a IndexedDB.
- Los presupuestos son un límite fijo mensual; no hay presupuestos distintos por mes ni arrastre de saldos.
