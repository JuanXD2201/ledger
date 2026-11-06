import { addDays, monthKey, monthsRange, shiftMonth } from './dates';
import { txEffect } from './balances';
import type { Account, Category, ISODate, MonthKey, Transaction } from './types';

export interface CategoryShare {
  categoryId: string;
  name: string;
  color: string;
  total: number;
  share: number;
}

/** Gasto del mes por categoría, de mayor a menor. Las transferencias no cuentan como gasto. */
export function spendingByCategory(txs: readonly Transaction[], categories: readonly Category[], month: MonthKey): CategoryShare[] {
  const totals = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== 'expense' || monthKey(tx.date) !== month) continue;
    const key = tx.categoryId ?? '';
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([categoryId, total]) => {
      const cat = categories.find((c) => c.id === categoryId);
      return { categoryId, name: cat?.name ?? 'Sin categoría', color: cat?.color ?? '#8a8a7a', total, share: grand > 0 ? total / grand : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

export interface MonthFlow {
  month: MonthKey;
  income: number;
  expense: number;
  net: number;
}

export function monthTotals(txs: readonly Transaction[], month: MonthKey): MonthFlow {
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (monthKey(tx.date) !== month) continue;
    if (tx.type === 'income') income += tx.amount;
    else if (tx.type === 'expense') expense += tx.amount;
  }
  return { month, income, expense, net: income - expense };
}

export function monthlyFlow(txs: readonly Transaction[], endMonth: MonthKey, count: number): MonthFlow[] {
  const months = monthsRange(endMonth, count);
  const map = new Map<MonthKey, MonthFlow>(months.map((m) => [m, { month: m, income: 0, expense: 0, net: 0 }]));
  for (const tx of txs) {
    const row = map.get(monthKey(tx.date));
    if (!row) continue;
    if (tx.type === 'income') row.income += tx.amount;
    else if (tx.type === 'expense') row.expense += tx.amount;
  }
  return months.map((m) => {
    const row = map.get(m)!;
    return { ...row, net: row.income - row.expense };
  });
}

export interface TrendPoint {
  date: ISODate;
  balance: number;
}

/** Patrimonio total al cierre de cada día en la ventana [end - days + 1, end]. */
export function balanceTrend(accounts: readonly Account[], txs: readonly Transaction[], end: ISODate, days: number): TrendPoint[] {
  const start = addDays(end, -(days - 1));
  const ids = accounts.map((a) => a.id);
  let balance = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const perDay = new Map<ISODate, number>();
  for (const tx of txs) {
    let delta = 0;
    for (const id of ids) delta += txEffect(tx, id);
    if (tx.date < start) balance += delta;
    else if (tx.date <= end) perDay.set(tx.date, (perDay.get(tx.date) ?? 0) + delta);
  }
  const points: TrendPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(start, i);
    balance += perDay.get(date) ?? 0;
    points.push({ date, balance });
  }
  return points;
}

export interface MonthComparison {
  current: MonthFlow;
  previous: MonthFlow;
  /** Variación frente al mes anterior; null si el anterior fue cero. */
  expenseChange: number | null;
  incomeChange: number | null;
}

const change = (now: number, before: number): number | null => (before === 0 ? null : (now - before) / before);

export function compareMonths(txs: readonly Transaction[], month: MonthKey): MonthComparison {
  const current = monthTotals(txs, month);
  const previous = monthTotals(txs, shiftMonth(month, -1));
  return { current, previous, expenseChange: change(current.expense, previous.expense), incomeChange: change(current.income, previous.income) };
}
