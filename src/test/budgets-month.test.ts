import { budgetStatuses, copyBudgetsToMonth, effectiveBudgets, hasMonthOverrides, resetMonthBudgets, setMonthBudget } from '../domain/budgets';
import { validateData } from '../domain/schema';
import { buildSampleData, starterData } from '../domain/seed';
import type { Budget, Transaction } from '../domain/types';

const base: Budget[] = [
  { categoryId: 'cat-mercado', limit: 700_000 },
  { categoryId: 'cat-ocio', limit: 300_000 },
];

describe('presupuestos por mes', () => {
  test('sin ajustes rige la plantilla base en cualquier mes', () => {
    expect(effectiveBudgets(base, '2026-03')).toEqual(base);
    expect(effectiveBudgets(base, '2031-12')).toEqual(base);
  });

  test('el ajuste de un mes manda solo en ese mes', () => {
    const next = setMonthBudget(base, '2026-03', 'cat-ocio', 450_000);
    expect(effectiveBudgets(next, '2026-03').find((b) => b.categoryId === 'cat-ocio')?.limit).toBe(450_000);
    expect(effectiveBudgets(next, '2026-04').find((b) => b.categoryId === 'cat-ocio')?.limit).toBe(300_000);
    expect(hasMonthOverrides(next, '2026-03')).toBe(true);
    expect(hasMonthOverrides(next, '2026-04')).toBe(false);
  });

  test('quitar una categoría de la plantilla en un mes la oculta solo ese mes', () => {
    const next = setMonthBudget(base, '2026-03', 'cat-ocio', null);
    expect(effectiveBudgets(next, '2026-03').map((b) => b.categoryId)).toEqual(['cat-mercado']);
    expect(effectiveBudgets(next, '2026-04').map((b) => b.categoryId)).toEqual(['cat-mercado', 'cat-ocio']);
  });

  test('quitar un presupuesto que solo existía en ese mes lo elimina sin dejar rastro', () => {
    const withMonth = setMonthBudget([], '2026-03', 'cat-salud', 90_000);
    expect(setMonthBudget(withMonth, '2026-03', 'cat-salud', null)).toEqual([]);
  });

  test('copiar al mes siguiente replica los vigentes y reemplaza ajustes previos', () => {
    let budgets = setMonthBudget(base, '2026-03', 'cat-ocio', 450_000);
    budgets = setMonthBudget(budgets, '2026-04', 'cat-mercado', 1);
    const copied = copyBudgetsToMonth(budgets, '2026-03', '2026-04');
    expect(effectiveBudgets(copied, '2026-04')).toEqual([
      { categoryId: 'cat-mercado', limit: 700_000 },
      { categoryId: 'cat-ocio', limit: 450_000 },
    ]);
    expect(effectiveBudgets(copied, '2026-03')).toEqual([
      { categoryId: 'cat-mercado', limit: 700_000 },
      { categoryId: 'cat-ocio', limit: 450_000 },
    ]);
    // el mes posterior sigue con la plantilla base
    expect(effectiveBudgets(copied, '2026-05').find((b) => b.categoryId === 'cat-ocio')?.limit).toBe(300_000);
  });

  test('copiar un mes donde una categoría estaba oculta la oculta también en el destino', () => {
    const budgets = setMonthBudget(base, '2026-03', 'cat-ocio', null);
    const copied = copyBudgetsToMonth(budgets, '2026-03', '2026-04');
    expect(effectiveBudgets(copied, '2026-04').map((b) => b.categoryId)).toEqual(['cat-mercado']);
  });

  test('restablecer un mes devuelve la plantilla base', () => {
    const budgets = resetMonthBudgets(setMonthBudget(base, '2026-03', 'cat-ocio', 1_000), '2026-03');
    expect(budgets).toEqual(base);
  });

  test('los estados de presupuesto usan el límite del mes', () => {
    const txs: Transaction[] = [{ id: 't', date: '2026-03-10', type: 'expense', amount: 380_000, accountId: 'a', categoryId: 'cat-ocio', tags: [], note: '' }];
    const adjusted = setMonthBudget(base, '2026-03', 'cat-ocio', 450_000);
    expect(budgetStatuses(base, txs, '2026-03').find((s) => s.categoryId === 'cat-ocio')?.level).toBe('exceeded');
    expect(budgetStatuses(adjusted, txs, '2026-03').find((s) => s.categoryId === 'cat-ocio')?.level).toBe('warning');
  });
});

describe('esquema con presupuestos por mes', () => {
  const withBudgets = (budgets: unknown[]) => {
    const data = starterData();
    return validateData({ ...data, budgets });
  };

  test('acepta ajustes con mes y el cero que oculta la plantilla', () => {
    const res = withBudgets([{ categoryId: 'cat-ocio', limit: 300_000 }, { categoryId: 'cat-ocio', limit: 0, month: '2026-03' }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.budgets[1]).toEqual({ categoryId: 'cat-ocio', limit: 0, month: '2026-03' });
  });

  test('rechaza mes inválido, límite cero en la plantilla y límites negativos', () => {
    expect(withBudgets([{ categoryId: 'cat-ocio', limit: 1, month: '2026-13' }]).ok).toBe(false);
    expect(withBudgets([{ categoryId: 'cat-ocio', limit: 0 }]).ok).toBe(false);
    expect(withBudgets([{ categoryId: 'cat-ocio', limit: -5, month: '2026-03' }]).ok).toBe(false);
  });

  test('un libro de ejemplo con ajustes por mes sobrevive a validar', () => {
    const data = buildSampleData('2026-03-15');
    const budgets = setMonthBudget(data.budgets, '2026-03', 'cat-ocio', 500_000);
    expect(validateData({ ...data, budgets }).ok).toBe(true);
  });
});
