import { balanceTrend, compareMonths, monthlyFlow, spendingByCategory } from '../domain/aggregates';
import { accounts, categories, tx } from '../domain/fixtures';
import { allTags, emptyFilter, filterTransactions, hasActiveFilter, paginate, parseTags, sortTransactions } from '../domain/filters';
import { buildDemoData } from '../domain/seed';
import { applyRecurring } from '../domain/recurrence';
import { validateTxDraft, type TxDraft } from '../domain/validation';
import { netWorth } from '../domain/balances';
import { budgetStatuses } from '../domain/budgets';

const sample = [
  tx({ date: '2025-05-02', amount: 80_000, note: 'Supermercado', tags: ['hogar'] }),
  tx({ date: '2025-05-10', amount: 40_000, categoryId: 'c-fun', note: 'Cine', accountId: 'a-card' }),
  tx({ date: '2025-05-12', amount: 3_000_000, type: 'income', categoryId: 'c-pay', note: 'Nómina' }),
  tx({ date: '2025-04-30', amount: 100_000, note: 'Mercado abril' }),
  tx({ date: '2025-05-15', amount: 50_000, type: 'transfer', accountId: 'a-bank', toAccountId: 'a-cash' }),
];

describe('agregaciones', () => {
  it('gasto por categoría ordenado, con participaciones que suman 1 y sin transferencias', () => {
    const res = spendingByCategory(sample, categories, '2025-05');
    expect(res.map((r) => r.name)).toEqual(['Mercado', 'Ocio']);
    expect(res.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
  });

  it('flujo mensual incluye meses sin movimientos con ceros', () => {
    const flow = monthlyFlow(sample, '2025-06', 3);
    expect(flow.map((f) => f.month)).toEqual(['2025-04', '2025-05', '2025-06']);
    expect(flow[1]).toMatchObject({ income: 3_000_000, expense: 120_000, net: 2_880_000 });
    expect(flow[2]).toMatchObject({ income: 0, expense: 0 });
  });

  it('compara con el mes anterior y devuelve null si no hay base', () => {
    const cmp = compareMonths(sample, '2025-05');
    expect(cmp.previous.expense).toBe(100_000);
    expect(cmp.expenseChange).toBeCloseTo(0.2);
    expect(compareMonths(sample, '2025-04').expenseChange).toBeNull();
  });

  it('la tendencia termina en el patrimonio actual y no se afecta por transferencias', () => {
    const trend = balanceTrend(accounts, sample, '2025-05-31', 40);
    expect(trend).toHaveLength(40);
    expect(trend[trend.length - 1]!.balance).toBe(netWorth(accounts, sample));
    const day = (d: string) => trend.find((p) => p.date === d)!.balance;
    expect(day('2025-05-15')).toBe(day('2025-05-14'));
  });
});

describe('filtros, orden y paginación', () => {
  const lookup = { accounts, categories };

  it('busca por texto ignorando tildes y mayúsculas', () => {
    expect(filterTransactions(sample, { ...emptyFilter(), text: 'NOMINA' }, lookup)).toHaveLength(1);
    expect(filterTransactions(sample, { ...emptyFilter(), text: 'ocio' }, lookup)).toHaveLength(1);
  });

  it('combina rango de fechas, cuenta y monto', () => {
    const f = { ...emptyFilter(), from: '2025-05-01', to: '2025-05-31', minAmount: 50_000, maxAmount: 100_000 };
    expect(filterTransactions(sample, f, lookup).map((t) => t.amount)).toEqual([80_000, 50_000]);
    expect(filterTransactions(sample, { ...emptyFilter(), accountId: 'a-cash' }, lookup)).toHaveLength(1);
  });

  it('filtra por etiqueta y tipo', () => {
    expect(filterTransactions(sample, { ...emptyFilter(), tag: 'hogar' }, lookup)).toHaveLength(1);
    expect(filterTransactions(sample, { ...emptyFilter(), type: 'income' }, lookup)).toHaveLength(1);
    expect(hasActiveFilter(emptyFilter())).toBe(false);
    expect(hasActiveFilter({ ...emptyFilter(), tag: 'x' })).toBe(true);
  });

  it('ordena por fecha y monto con desempate estable', () => {
    expect(sortTransactions(sample, 'date', 'desc')[0]!.date).toBe('2025-05-15');
    expect(sortTransactions(sample, 'amount', 'asc')[0]!.amount).toBe(40_000);
  });

  it('pagina y ajusta páginas fuera de rango', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(items, 3, 10).items).toEqual([20, 21, 22]);
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, -4, 10).page).toBe(1);
    expect(paginate([], 1, 10)).toMatchObject({ pageCount: 1, total: 0 });
  });

  it('normaliza etiquetas', () => {
    expect(parseTags('#Hogar, hogar  Viaje;ocio')).toEqual(['hogar', 'viaje', 'ocio']);
    expect(allTags(sample)).toEqual(['hogar']);
  });
});

describe('validación del formulario', () => {
  const ok: TxDraft = { type: 'expense', date: '2025-05-01', amount: 1000, accountId: 'a-bank', toAccountId: '', categoryId: 'c-food', note: '' };
  const ctx = { accounts, categories };

  it('acepta un borrador correcto', () => {
    expect(validateTxDraft(ok, ctx)).toEqual({});
  });

  it('explica cada error', () => {
    const errors = validateTxDraft({ ...ok, date: '2025-02-31', amount: null, categoryId: 'c-pay' }, ctx);
    expect(errors.date).toBeDefined();
    expect(errors.amount).toMatch(/mayor que cero/);
    expect(errors.categoryId).toMatch(/no corresponde/);
  });

  it('exige destino distinto en transferencias', () => {
    expect(validateTxDraft({ ...ok, type: 'transfer', toAccountId: 'a-bank' }, ctx).toAccountId).toMatch(/distintas/);
    expect(validateTxDraft({ ...ok, type: 'transfer', toAccountId: 'a-cash' }, ctx)).toEqual({});
  });
});

describe('datos de ejemplo', () => {
  it('son deterministas y dejan presupuestos en aviso y superados este mes', () => {
    const a = buildDemoData('2025-11-20');
    const b = buildDemoData('2025-11-20');
    expect(a).toEqual(b);
    const st = budgetStatuses(a.budgets, a.transactions, '2025-11');
    expect(st.find((s) => s.categoryId === 'cat-restaurantes')!.level).toBe('exceeded');
    expect(st.find((s) => s.categoryId === 'cat-mercado')!.level).toBe('warning');
  });

  it('no tienen movimientos futuros y el salario cae a fin de mes', () => {
    const d = buildDemoData('2025-03-10');
    expect(d.transactions.every((t) => t.date <= '2025-03-10')).toBe(true);
    expect(applyRecurring(d, '2025-03-10')).toBe(d);
    expect(d.transactions.some((t) => t.recurringId === 'rec-salario' && t.date === '2025-02-28')).toBe(true);
  });
});
