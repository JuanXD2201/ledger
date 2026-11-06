import { monthKey } from './dates';
import type { Budget, MonthKey, Transaction } from './types';

export type BudgetLevel = 'ok' | 'warning' | 'exceeded';

export interface BudgetStatus {
  categoryId: string;
  limit: number;
  spent: number;
  remaining: number;
  ratio: number;
  level: BudgetLevel;
}

/**
 * Aviso al 80 % y límite alcanzado al 100 % (gastar exactamente el límite ya cuenta).
 * Aritmética entera para evitar errores de redondeo.
 */
export function budgetLevel(spent: number, limit: number): BudgetLevel {
  if (limit <= 0) return 'ok';
  if (spent * 100 >= limit * 100) return 'exceeded';
  if (spent * 100 >= limit * 80) return 'warning';
  return 'ok';
}

export function spentByCategory(txs: readonly Transaction[], month: MonthKey): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== 'expense' || !tx.categoryId || monthKey(tx.date) !== month) continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amount);
  }
  return totals;
}

export function budgetStatuses(budgets: readonly Budget[], txs: readonly Transaction[], month: MonthKey): BudgetStatus[] {
  const spentMap = spentByCategory(txs, month);
  return budgets
    .map((b) => {
      const spent = spentMap.get(b.categoryId) ?? 0;
      return {
        categoryId: b.categoryId,
        limit: b.limit,
        spent,
        remaining: b.limit - spent,
        ratio: b.limit > 0 ? spent / b.limit : 0,
        level: budgetLevel(spent, b.limit),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export const budgetAlerts = (statuses: readonly BudgetStatus[]): BudgetStatus[] => statuses.filter((s) => s.level !== 'ok');
