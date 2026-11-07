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
  return effectiveBudgets(budgets, month)
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

/**
 * Presupuestos vigentes en un mes: el ajuste propio del mes manda sobre la plantilla base.
 * Un ajuste con límite 0 significa «sin presupuesto este mes» y se omite.
 */
export function effectiveBudgets(budgets: readonly Budget[], month: MonthKey): Budget[] {
  const byCategory = new Map<string, Budget>();
  for (const b of budgets) if (b.month === undefined) byCategory.set(b.categoryId, b);
  for (const b of budgets) if (b.month === month) byCategory.set(b.categoryId, b);
  return [...byCategory.values()].filter((b) => b.limit > 0).map((b) => ({ categoryId: b.categoryId, limit: b.limit }));
}

/** Fija (o quita, con `null`) el límite de una categoría solo para `month`. */
export function setMonthBudget(budgets: readonly Budget[], month: MonthKey, categoryId: string, limit: number | null): Budget[] {
  const rest = budgets.filter((b) => !(b.month === month && b.categoryId === categoryId));
  const hasBase = budgets.some((b) => b.month === undefined && b.categoryId === categoryId);
  if (limit !== null) return [...rest, { categoryId, limit, month }];
  // Quitar: si existe plantilla base hace falta un «0» para ocultarla solo ese mes.
  return hasBase ? [...rest, { categoryId, limit: 0, month }] : rest;
}

/** Copia los presupuestos vigentes de `from` a `to`, reemplazando cualquier ajuste previo de `to`. */
export function copyBudgetsToMonth(budgets: readonly Budget[], from: MonthKey, to: MonthKey): Budget[] {
  const source = new Map(effectiveBudgets(budgets, from).map((b) => [b.categoryId, b.limit]));
  const categories = new Set(budgets.map((b) => b.categoryId));
  const kept = budgets.filter((b) => b.month !== to);
  const copied: Budget[] = [];
  for (const categoryId of categories) {
    const limit = source.get(categoryId);
    if (limit !== undefined) copied.push({ categoryId, limit, month: to });
    else if (budgets.some((b) => b.month === undefined && b.categoryId === categoryId)) copied.push({ categoryId, limit: 0, month: to });
  }
  return [...kept, ...copied];
}

/** Quita los ajustes propios de un mes: vuelve a regir la plantilla base. */
export const resetMonthBudgets = (budgets: readonly Budget[], month: MonthKey): Budget[] => budgets.filter((b) => b.month !== month);

export const hasMonthOverrides = (budgets: readonly Budget[], month: MonthKey): boolean => budgets.some((b) => b.month === month);
