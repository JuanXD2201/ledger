import { useMemo } from 'react';
import { balanceTrend, compareMonths } from '../../domain/aggregates';
import { balancesById } from '../../domain/balances';
import { budgetAlerts, budgetStatuses } from '../../domain/budgets';
import { monthKey, shiftMonth } from '../../domain/dates';
import { formatCOP, formatDateLong, formatMonth, formatPercent } from '../../domain/format';
import { nextOccurrence } from '../../domain/recurrence';
import { sortTransactions } from '../../domain/filters';
import { Amount, EmptyState, LevelBadge, PageHeader, ProgressBar } from '../components/common';
import { Icon } from '../components/Icon';
import { TxTable } from '../components/TxTable';
import { TrendLine } from '../charts/charts';
import type { RoutePath } from '../hooks';
import { useLedger } from '../store';

const ACCOUNT_LABEL = { cash: 'Efectivo', bank: 'Banco', credit: 'Tarjeta de crédito' } as const;

export function Dashboard({ onNew, go }: { onNew: () => void; go: (r: RoutePath) => void }) {
  const { data, today, loadDemo } = useLedger();
  const month = monthKey(today);

  const view = useMemo(() => {
    const balances = balancesById(data.accounts, data.transactions, today);
    const total = Object.values(balances).reduce((a, b) => a + b, 0);
    const trend = balanceTrend(data.accounts, data.transactions, today, 90);
    const cmp = compareMonths(data.transactions, month);
    const alerts = budgetAlerts(budgetStatuses(data.budgets, data.transactions, month));
    const recent = sortTransactions(data.transactions, 'date', 'desc').slice(0, 7);
    const upcoming = data.recurring
      .map((r) => ({ r, next: nextOccurrence(r, today) }))
      .filter((u): u is { r: typeof u.r; next: string } => u.next !== null)
      .sort((a, b) => a.next.localeCompare(b.next))
      .slice(0, 3);
    return { balances, total, trend, cmp, alerts, recent, upcoming };
  }, [data, today, month]);

  if (data.transactions.length === 0 && data.accounts.length <= 1) {
    return (
      <>
        <PageHeader title="Panel" lead="Tu libro está en blanco. Empieza por el primer movimiento." />
        <EmptyState
          icon="wallet"
          title="Todavía no hay movimientos"
          actions={
            <>
              <button type="button" className="btn" onClick={onNew}>Registrar un movimiento</button>
              <button type="button" className="btn btn--ghost" onClick={loadDemo}>Cargar datos de ejemplo</button>
            </>
          }
        >
          Registra un gasto o un ingreso, o carga datos de ejemplo para recorrer la aplicación con información realista.
        </EmptyState>
      </>
    );
  }

  const change30 = view.total - (view.trend[view.trend.length - 31]?.balance ?? view.total);
  const { cmp } = view;
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Categoría';

  return (
    <>
      <PageHeader
        title="Panel"
        lead={`Así va tu dinero al ${formatDateLong(today)}.`}
      />

      <section className="hero" aria-label="Resumen">
        <div className="hero__main">
          <p className="hero__label">Patrimonio total</p>
          <p className="hero__figure" data-testid="patrimonio">{formatCOP(view.total)}</p>
          <p className={`hero__delta ${change30 >= 0 ? 'is-up' : 'is-down'}`}>
            {change30 >= 0 ? 'Subió' : 'Bajó'} <Amount value={Math.abs(change30)} tone="neutral" /> en los últimos 30 días
          </p>
          <TrendLine points={view.trend} height={150} compact />
        </div>

        <div className="hero__side">
          <h2 className="h-serif">{formatMonth(month)}</h2>
          <dl className="ledger-rows">
            <div><dt>Ingresos</dt><dd><Amount value={cmp.current.income} tone="income" /></dd></div>
            <div><dt>Gastos</dt><dd><Amount value={cmp.current.expense} tone="expense" /></dd></div>
            <div className="ledger-rows__total"><dt>Balance del mes</dt><dd><Amount value={cmp.current.net} /></dd></div>
          </dl>
          <p className="hero__note">
            {cmp.expenseChange === null
              ? `Sin gastos en ${formatMonth(shiftMonth(month, -1))} para comparar.`
              : cmp.expenseChange === 0
                ? `Gastas lo mismo que en ${formatMonth(shiftMonth(month, -1))}.`
                : `Llevas el ${formatPercent(cmp.current.expense / cmp.previous.expense)} de lo que gastaste en ${formatMonth(shiftMonth(month, -1))}.`}
          </p>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="h-alerts">
          <div className="panel__head">
            <h2 id="h-alerts" className="h-serif">Presupuestos en alerta</h2>
            <button type="button" className="link-btn" onClick={() => go('presupuestos')}>Ver todos</button>
          </div>
          {view.alerts.length === 0 ? (
            <p className="muted">Ningún presupuesto supera el 80 % este mes.</p>
          ) : (
            <ul className="alert-list">
              {view.alerts.slice(0, 4).map((s) => (
                <li key={s.categoryId}>
                  <div className="alert-list__top">
                    <strong>{catName(s.categoryId)}</strong>
                    <span className="num">{formatPercent(s.ratio)}</span>
                  </div>
                  <ProgressBar ratio={s.ratio} level={s.level} label={`Presupuesto de ${catName(s.categoryId)}`} />
                  <div className="alert-list__bottom">
                    <span className="muted">{formatCOP(s.spent)} de {formatCOP(s.limit)}</span>
                    <LevelBadge level={s.level} ratio={s.ratio} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="h-accounts">
          <div className="panel__head">
            <h2 id="h-accounts" className="h-serif">Cuentas</h2>
            <button type="button" className="link-btn" onClick={() => go('cuentas')}>Administrar</button>
          </div>
          <dl className="ledger-rows">
            {data.accounts.map((a) => (
              <div key={a.id}>
                <dt>{a.name}{ACCOUNT_LABEL[a.type].toLowerCase() !== a.name.toLowerCase() && <span className="muted small"> · {ACCOUNT_LABEL[a.type]}</span>}</dt>
                <dd><Amount value={view.balances[a.id] ?? 0} /></dd>
              </div>
            ))}
            <div className="ledger-rows__total"><dt>Total</dt><dd><Amount value={view.total} /></dd></div>
          </dl>
        </section>
      </div>

      <section className="panel" aria-labelledby="h-recent">
        <div className="panel__head">
          <h2 id="h-recent" className="h-serif">Últimos movimientos</h2>
          <button type="button" className="link-btn" onClick={() => go('movimientos')}>Ver todos</button>
        </div>
        <TxTable txs={view.recent} data={data} caption="Últimos movimientos" />
      </section>

      {view.upcoming.length > 0 && (
        <section className="panel" aria-labelledby="h-upcoming">
          <div className="panel__head">
            <h2 id="h-upcoming" className="h-serif">Próximos movimientos recurrentes</h2>
            <button type="button" className="link-btn" onClick={() => go('cuentas')}>Administrar</button>
          </div>
          <ul className="upcoming">
            {view.upcoming.map(({ r, next }) => (
              <li key={r.id}>
                <Icon name="repeat" size={16} />
                <span>{r.name}</span>
                <span className="muted">{formatDateLong(next)}</span>
                <Amount value={r.amount} tone={r.type} signed />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
