import { addDays, daysInMonth, monthKey, monthStart, shiftMonth, toISO } from './dates';
import { applyRecurring } from './recurrence';
import type { Category, ISODate, LedgerData, Recurring, Transaction } from './types';

/** Generador pseudoaleatorio determinista: los datos de ejemplo son reproducibles. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-vivienda', name: 'Vivienda', kind: 'expense', color: '#1f4d3a' },
  { id: 'cat-mercado', name: 'Mercado', kind: 'expense', color: '#c9602f' },
  { id: 'cat-restaurantes', name: 'Restaurantes', kind: 'expense', color: '#d9a441' },
  { id: 'cat-transporte', name: 'Transporte', kind: 'expense', color: '#5f7f6e' },
  { id: 'cat-servicios', name: 'Servicios', kind: 'expense', color: '#6b6f9a' },
  { id: 'cat-salud', name: 'Salud', kind: 'expense', color: '#9a5f78' },
  { id: 'cat-ocio', name: 'Ocio', kind: 'expense', color: '#8a6a3f' },
  { id: 'cat-compras', name: 'Compras', kind: 'expense', color: '#4f8aa0' },
  { id: 'cat-educacion', name: 'Educación', kind: 'expense', color: '#7d8f4a' },
  { id: 'cat-otros-gastos', name: 'Otros gastos', kind: 'expense', color: '#8a8a7a' },
  { id: 'cat-salario', name: 'Salario', kind: 'income', color: '#2f6b4f' },
  { id: 'cat-freelance', name: 'Freelance', kind: 'income', color: '#7aa57a' },
  { id: 'cat-otros-ingresos', name: 'Otros ingresos', kind: 'income', color: '#a8b08a' },
];

/** Categorías mínimas para quien empieza vacío. */
export const starterData = (): LedgerData => ({
  accounts: [{ id: 'acc-efectivo', name: 'Efectivo', type: 'cash', openingBalance: 0 }],
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  transactions: [],
  recurring: [],
  budgets: [],
});

const clampDay = (key: string, day: number): ISODate => {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
};

interface Template {
  categoryId: string;
  p: number;
  min: number;
  max: number;
  notes: string[];
  accounts: [string, number][];
  tags?: string[];
}

const TEMPLATES: Template[] = [
  { categoryId: 'cat-mercado', p: 0.17, min: 45_000, max: 185_000, notes: ['Compra semanal', 'Frutas y verduras', 'Supermercado', 'Plaza de mercado'], accounts: [['acc-tarjeta', 0.6], ['acc-ahorros', 1]], tags: ['hogar'] },
  { categoryId: 'cat-restaurantes', p: 0.12, min: 18_000, max: 92_000, notes: ['Almuerzo', 'Cena con amigos', 'Domicilio', 'Café y pan'], accounts: [['acc-efectivo', 0.5], ['acc-tarjeta', 1]] },
  { categoryId: 'cat-transporte', p: 0.1, min: 8_000, max: 48_000, notes: ['Taxi', 'Gasolina', 'Peaje', 'Parqueadero'], accounts: [['acc-efectivo', 0.6], ['acc-tarjeta', 1]] },
  { categoryId: 'cat-salud', p: 0.02, min: 25_000, max: 160_000, notes: ['Droguería', 'Cita médica', 'Examen de laboratorio'], accounts: [['acc-ahorros', 1]] },
  { categoryId: 'cat-ocio', p: 0.05, min: 20_000, max: 110_000, notes: ['Cine', 'Concierto', 'Videojuego', 'Salida con amigos'], accounts: [['acc-tarjeta', 0.7], ['acc-efectivo', 1]], tags: ['ocio'] },
  { categoryId: 'cat-compras', p: 0.03, min: 40_000, max: 240_000, notes: ['Ropa', 'Libro', 'Accesorios', 'Regalo'], accounts: [['acc-tarjeta', 1]] },
  { categoryId: 'cat-educacion', p: 0.012, min: 60_000, max: 220_000, notes: ['Curso en línea', 'Material de estudio'], accounts: [['acc-ahorros', 1]], tags: ['estudio'] },
];

const round1000 = (n: number) => Math.round(n / 1000) * 1000;

/**
 * Datos de ejemplo realistas para los últimos ~6 meses, relativos a `today`.
 * El mes en curso queda con presupuestos en aviso (Mercado, 86 %) y superados (Restaurantes, 108 %).
 */
export function buildSampleData(today: ISODate): LedgerData {
  const rand = mulberry32(2201);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const currentMonth = monthKey(today);
  const firstMonth = shiftMonth(currentMonth, -5);
  const windowStart = monthStart(firstMonth);
  let counter = 0;
  const id = () => `ej-${(counter += 1).toString(36)}`;

  // Mes inicial con 31 días, para que el día ancla del seguro (31) sea real y se ajuste en meses cortos.
  let anchorMonth = firstMonth;
  while (daysInMonth(Number(anchorMonth.slice(0, 4)), Number(anchorMonth.slice(5))) < 31) anchorMonth = shiftMonth(anchorMonth, 1);

  const recurring: Recurring[] = [
    { id: 'rec-salario', name: 'Salario mensual', type: 'income', amount: 4_200_000, accountId: 'acc-ahorros', categoryId: 'cat-salario', frequency: 'monthly', startDate: clampDay(firstMonth, 1), tags: ['nómina'] },
    { id: 'rec-seguro', name: 'Seguro de la moto', type: 'expense', amount: 96_500, accountId: 'acc-ahorros', categoryId: 'cat-transporte', frequency: 'monthly', startDate: clampDay(anchorMonth, 31), tags: ['seguro'] },
    { id: 'rec-arriendo', name: 'Arriendo del apartamento', type: 'expense', amount: 1_350_000, accountId: 'acc-ahorros', categoryId: 'cat-vivienda', frequency: 'monthly', startDate: clampDay(firstMonth, 5), tags: ['hogar'] },
    { id: 'rec-internet', name: 'Internet y celular', type: 'expense', amount: 129_900, accountId: 'acc-ahorros', categoryId: 'cat-servicios', frequency: 'monthly', startDate: clampDay(firstMonth, 12), tags: ['hogar'] },
    { id: 'rec-streaming', name: 'Plataforma de series', type: 'expense', amount: 29_900, accountId: 'acc-tarjeta', categoryId: 'cat-ocio', frequency: 'monthly', startDate: clampDay(firstMonth, 18), tags: ['suscripción'] },
    { id: 'rec-recarga', name: 'Recarga de transporte', type: 'expense', amount: 30_000, accountId: 'acc-efectivo', categoryId: 'cat-transporte', frequency: 'weekly', startDate: addDays(windowStart, 3), tags: [] },
  ];

  const transactions: Transaction[] = [];
  for (let date = windowStart; date <= today; date = addDays(date, 1)) {
    for (const t of TEMPLATES) {
      if (rand() > t.p) continue;
      const roll = rand();
      let acc = t.accounts[t.accounts.length - 1]![0];
      for (const [candidate, threshold] of t.accounts) {
        if (roll <= threshold) {
          acc = candidate;
          break;
        }
      }
      transactions.push({
        id: id(),
        date,
        type: 'expense',
        amount: round1000(t.min + rand() * (t.max - t.min)),
        accountId: acc,
        categoryId: t.categoryId,
        tags: t.tags && rand() < 0.5 ? [...t.tags] : [],
        note: pick(t.notes),
      });
    }
  }

  for (let i = 0; i < 6; i += 1) {
    const key = shiftMonth(firstMonth, i);
    const freelance = clampDay(key, 8 + Math.floor(rand() * 18));
    if (freelance <= today && rand() < 0.8) {
      transactions.push({ id: id(), date: freelance, type: 'income', amount: round1000(300_000 + rand() * 600_000), accountId: 'acc-ahorros', categoryId: 'cat-freelance', tags: ['freelance'], note: 'Proyecto freelance' });
    }
    const cardPayment = clampDay(key, 25);
    if (cardPayment <= today) {
      transactions.push({ id: id(), date: cardPayment, type: 'transfer', amount: 800_000, accountId: 'acc-ahorros', toAccountId: 'acc-tarjeta', tags: [], note: 'Pago de tarjeta' });
    }
    const withdrawal = clampDay(key, 8);
    if (withdrawal <= today && withdrawal >= windowStart) {
      transactions.push({ id: id(), date: withdrawal, type: 'transfer', amount: 300_000, accountId: 'acc-ahorros', toAccountId: 'acc-efectivo', tags: [], note: 'Retiro para efectivo' });
    }
  }

  const base: LedgerData = {
    accounts: [
      { id: 'acc-efectivo', name: 'Efectivo', type: 'cash', openingBalance: 180_000 },
      { id: 'acc-ahorros', name: 'Cuenta de ahorros', type: 'bank', openingBalance: 2_600_000 },
      { id: 'acc-tarjeta', name: 'Tarjeta de crédito', type: 'credit', openingBalance: -420_000 },
    ],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions,
    recurring,
    budgets: [
      { categoryId: 'cat-vivienda', limit: 1_400_000 },
      { categoryId: 'cat-mercado', limit: 700_000 },
      { categoryId: 'cat-restaurantes', limit: 350_000 },
      { categoryId: 'cat-transporte', limit: 300_000 },
      { categoryId: 'cat-servicios', limit: 200_000 },
      { categoryId: 'cat-ocio', limit: 300_000 },
      { categoryId: 'cat-compras', limit: 400_000 },
    ],
  };

  const data = applyRecurring(base, today);

  // Ajusta el mes en curso para que el ejemplo muestre un aviso al 80 % y un presupuesto superado.
  // Se reemplazan los gastos sueltos de esas categorías por varios movimientos que suman el objetivo.
  const targets: [string, number, string[]][] = [
    ['cat-mercado', 0.86, ['Compra grande del mes', 'Frutas y verduras', 'Supermercado']],
    ['cat-restaurantes', 1.08, ['Cena de cumpleaños', 'Almuerzo de trabajo', 'Domicilio']],
  ];
  const targetIds = new Set(targets.map(([c]) => c));
  const kept = data.transactions.filter((t) => !(monthKey(t.date) === currentMonth && t.type === 'expense' && !t.recurringId && targetIds.has(t.categoryId ?? '')));
  const extra: Transaction[] = [];
  for (const [categoryId, ratio, notes] of targets) {
    const limit = data.budgets.find((b) => b.categoryId === categoryId)?.limit ?? 0;
    const total = round1000(limit * ratio);
    const shares = [0.5, 0.3, 0.2];
    shares.forEach((share, i) => {
      const back = addDays(today, -i * 2);
      extra.push({
        id: id(),
        date: back < monthStart(currentMonth) ? monthStart(currentMonth) : back,
        type: 'expense',
        amount: i === shares.length - 1 ? total - round1000(total * 0.5) - round1000(total * 0.3) : round1000(total * share),
        accountId: 'acc-tarjeta',
        categoryId,
        tags: [],
        note: notes[i] ?? 'Gasto',
      });
    });
  }
  return { ...data, transactions: [...kept, ...extra] };
}
