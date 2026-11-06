import { accountBalance, balancesById, netWorth } from '../domain/balances';
import { budgetAlerts, budgetLevel, budgetStatuses } from '../domain/budgets';
import { accounts, tx } from '../domain/fixtures';

describe('saldos', () => {
  it('suma ingresos y resta gastos sobre el saldo inicial', () => {
    const txs = [tx({ date: '2025-05-01', amount: 500_000, type: 'income', categoryId: 'c-pay' }), tx({ date: '2025-05-02', amount: 120_000 })];
    expect(accountBalance(accounts[1]!, txs)).toBe(1_380_000);
  });

  it('una transferencia resta del origen y suma al destino sin cambiar el patrimonio', () => {
    const txs = [tx({ date: '2025-05-03', amount: 300_000, type: 'transfer', accountId: 'a-bank', toAccountId: 'a-cash', categoryId: undefined as never })];
    const balances = balancesById(accounts, txs);
    expect(balances['a-bank']).toBe(700_000);
    expect(balances['a-cash']).toBe(400_000);
    expect(netWorth(accounts, txs)).toBe(netWorth(accounts, []));
  });

  it('pagar la tarjeta desde el banco reduce la deuda', () => {
    const txs = [tx({ date: '2025-05-04', amount: 200_000, type: 'transfer', accountId: 'a-bank', toAccountId: 'a-card' })];
    expect(balancesById(accounts, txs)['a-card']).toBe(0);
  });

  it('respeta el corte por fecha', () => {
    const txs = [tx({ date: '2025-05-01', amount: 10_000 }), tx({ date: '2025-06-01', amount: 20_000 })];
    expect(balancesById(accounts, txs, '2025-05-31')['a-bank']).toBe(990_000);
  });

  it('ignora movimientos de cuentas inexistentes sin romperse', () => {
    const txs = [tx({ date: '2025-05-01', amount: 1_000, accountId: 'fantasma' })];
    expect(netWorth(accounts, txs)).toBe(netWorth(accounts, []));
  });
});

describe('presupuestos', () => {
  it.each([
    [0, 'ok'],
    [79_999, 'ok'],
    [80_000, 'warning'],
    [99_999, 'warning'],
    [100_000, 'exceeded'],
    [150_000, 'exceeded'],
  ] as const)('gasto %i sobre límite 100000 es %s', (spent, level) => {
    expect(budgetLevel(spent, 100_000)).toBe(level);
  });

  it('un límite inválido no genera alertas', () => {
    expect(budgetLevel(50, 0)).toBe('ok');
  });

  it('calcula estados del mes y solo cuenta gastos de esa categoría y mes', () => {
    const txs = [
      tx({ date: '2025-05-02', amount: 80_000 }),
      tx({ date: '2025-05-20', amount: 20_000 }),
      tx({ date: '2025-04-30', amount: 500_000 }),
      tx({ date: '2025-05-05', amount: 90_000, categoryId: 'c-fun' }),
      tx({ date: '2025-05-06', amount: 70_000, type: 'transfer', accountId: 'a-bank', toAccountId: 'a-cash' }),
    ];
    const res = budgetStatuses([{ categoryId: 'c-food', limit: 100_000 }, { categoryId: 'c-fun', limit: 300_000 }], txs, '2025-05');
    const food = res.find((s) => s.categoryId === 'c-food')!;
    expect(food.spent).toBe(100_000);
    expect(food.level).toBe('exceeded');
    expect(food.remaining).toBe(0);
    expect(res.find((s) => s.categoryId === 'c-fun')!.level).toBe('ok');
  });

  it('lista solo las alertas, ordenadas por avance', () => {
    const txs = [tx({ date: '2025-05-02', amount: 85_000 }), tx({ date: '2025-05-03', amount: 130_000, categoryId: 'c-fun' })];
    const alerts = budgetAlerts(budgetStatuses([{ categoryId: 'c-food', limit: 100_000 }, { categoryId: 'c-fun', limit: 100_000 }], txs, '2025-05'));
    expect(alerts.map((a) => a.level)).toEqual(['exceeded', 'warning']);
  });
});
