import { useMemo, useState } from 'react';
import { balanceTrend, compareMonths, monthlyFlow, spendingByCategory } from '../../domain/aggregates';
import { monthEnd, monthKey, shiftMonth } from '../../domain/dates';
import { formatCOP, formatMonth, formatMonthShort, formatPercent } from '../../domain/format';
import { Amount, EmptyState, MonthPicker, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { Donut, FlowBars, TrendLine } from '../charts/charts';
import { useLedger } from '../store';

function Change({ value, goodWhenDown }: { value: number | null; goodWhenDown?: boolean }) {
  if (value === null) return <span className="muted">Sin base</span>;
  if (Math.abs(value) < 0.005) return <span className="muted">Sin cambio</span>;
  const up = value > 0;
  const good = goodWhenDown ? !up : up;
  return (
    <span className={`change ${good ? 'change--good' : 'change--bad'}`}>
      {up ? '▲' : '▼'} {formatPercent(Math.abs(value))}
    </span>
  );
}

export function Reports() {
  const { data, today } = useLedger();
  const [month, setMonth] = useState(monthKey(today));
  const prev = shiftMonth(month, -1);
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);

  const view = useMemo(() => {
    const slices = spendingByCategory(data.transactions, data.categories, month);
    const total = slices.reduce((s, c) => s + c.total, 0);
    const flow = monthlyFlow(data.transactions, month, 6);
    const end = month === monthKey(today) ? today : monthEnd(month);
    const trend = balanceTrend(data.accounts, data.transactions, end, 120);
    return { slices, total, flow, trend, cmp: compareMonths(data.transactions, month) };
  }, [data, month, today]);

  const annual = useMemo(() => {
    const flow = monthlyFlow(data.transactions, `${year}-12`, 12);
    const income = flow.reduce((s, f) => s + f.income, 0);
    const expense = flow.reduce((s, f) => s + f.expense, 0);
    const peak = flow.reduce((best, f) => (f.expense > best.expense ? f : best), flow[0]!);
    return { flow, income, expense, net: income - expense, peak };
  }, [data.transactions, year]);

  if (data.transactions.length === 0) {
    return (
      <>
        <PageHeader title="Informes" lead="Gráficos de tus gastos, ingresos y saldo." />
        <EmptyState icon="chart" title="Sin datos para graficar">Registra movimientos o carga datos de ejemplo desde «Importar y respaldo» para ver los informes.</EmptyState>
      </>
    );
  }

  const { cmp } = view;
  return (
    <>
      <PageHeader title="Informes" lead="Cómo se reparte, se mueve y cambia tu dinero." actions={<MonthPicker month={month} onChange={setMonth} max={monthKey(today)} />} />

      <div className="grid-reports">
        <section className="panel" aria-labelledby="r-cat">
          <h2 id="r-cat" className="h-serif">Gasto por categoría</h2>
          {view.slices.length === 0 ? (
            <p className="muted">No hubo gastos en {formatMonth(month)}.</p>
          ) : (
            <div className="donut-wrap">
              <Donut slices={view.slices} total={view.total} />
              <ul className="legend">
                {view.slices.map((s) => (
                  <li key={s.categoryId}>
                    <i className="dot" style={{ background: s.color }} aria-hidden="true" />
                    <span className="legend__name">{s.name}</span>
                    <span className="num">{formatCOP(s.total)}</span>
                    <span className="num muted legend__pct">{formatPercent(s.share)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="r-cmp">
          <h2 id="r-cmp" className="h-serif cmp-title">{formatMonth(month)} frente a {formatMonth(prev)}</h2>
          <table className="cmp-table">
            <caption className="sr-only">Comparación con el mes anterior</caption>
            <thead>
              <tr><th scope="col"><span className="sr-only">Concepto</span></th><th scope="col" className="num-col">Este mes</th><th scope="col" className="num-col">Anterior</th><th scope="col" className="num-col">Cambio</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Ingresos</th><td className="num-col"><Amount value={cmp.current.income} tone="income" /></td><td className="num-col"><Amount value={cmp.previous.income} /></td><td className="num-col"><Change value={cmp.incomeChange} /></td></tr>
              <tr><th scope="row">Gastos</th><td className="num-col"><Amount value={cmp.current.expense} tone="expense" /></td><td className="num-col"><Amount value={cmp.previous.expense} /></td><td className="num-col"><Change value={cmp.expenseChange} goodWhenDown /></td></tr>
              <tr className="cmp-table__total"><th scope="row">Balance</th><td className="num-col"><Amount value={cmp.current.net} /></td><td className="num-col"><Amount value={cmp.previous.net} /></td><td className="num-col"><span className="muted">{formatCOP(cmp.current.net - cmp.previous.net)}</span></td></tr>
            </tbody>
          </table>
        </section>

        <section className="panel panel--wide" aria-labelledby="r-flow">
          <div className="panel__head">
            <h2 id="r-flow" className="h-serif">Flujo de los últimos 6 meses</h2>
            <p className="chart-key"><i className="key key--income" /> Ingresos <i className="key key--expense" /> Gastos</p>
          </div>
          <FlowBars flow={view.flow} />
        </section>

        <section className="panel panel--wide" aria-labelledby="r-year" data-testid="informe-anual">
          <div className="panel__head">
            <h2 id="r-year" className="h-serif">Resumen de {year}</h2>
            <div className="month-picker" role="group" aria-label="Año">
              <button type="button" className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Año anterior"><Icon name="left" /></button>
              <span className="month-picker__label" aria-live="polite">{year}</span>
              <button type="button" className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Año siguiente" disabled={year >= currentYear}><Icon name="right" /></button>
            </div>
          </div>
          {annual.income === 0 && annual.expense === 0 ? (
            <p className="muted">No hay movimientos registrados en {year}.</p>
          ) : (
            <>
              <ul className="stats stats--year">
                <li><strong data-testid="anual-ingresos">{formatCOP(annual.income)}</strong> ingresos</li>
                <li><strong data-testid="anual-gastos">{formatCOP(annual.expense)}</strong> gastos</li>
                <li><strong>{formatCOP(annual.net)}</strong> balance del año</li>
                {annual.peak.expense > 0 && <li><strong>{formatMonthShort(annual.peak.month)}</strong> mes de mayor gasto</li>}
              </ul>
              <p className="chart-key"><i className="key key--income" /> Ingresos <i className="key key--expense" /> Gastos</p>
              <FlowBars flow={annual.flow} />
            </>
          )}
        </section>

        <section className="panel panel--wide" aria-labelledby="r-trend">
          <h2 id="r-trend" className="h-serif">Tendencia del saldo total</h2>
          <TrendLine points={view.trend} />
        </section>
      </div>
    </>
  );
}
