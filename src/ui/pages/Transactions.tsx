import { useEffect, useMemo, useState } from 'react';
import { allTags, emptyFilter, filterTransactions, hasActiveFilter, paginate, sortTransactions, type SortDir, type SortKey, type TxFilter } from '../../domain/filters';
import { formatCOP } from '../../domain/format';
import { parseAmount } from '../../domain/money';
import type { Transaction, TxType } from '../../domain/types';
import { Amount, EmptyState, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { TxTable, describeTx } from '../components/TxTable';
import { useLedger } from '../store';
import { useToast } from '../toast';

const PAGE_SIZE = 12;

export function Transactions({ onNew, onEdit }: { onNew: () => void; onEdit: (tx: Transaction) => void }) {
  const { data, removeTransaction, restoreTransaction } = useLedger();
  const toast = useToast();
  const [filter, setFilter] = useState<TxFilter>(emptyFilter);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const set = <K extends keyof TxFilter>(key: K, value: TxFilter[K]) => {
    setFilter((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const clear = () => {
    setFilter(emptyFilter());
    setMinText('');
    setMaxText('');
    setPage(1);
  };

  const filtered = useMemo(() => filterTransactions(data.transactions, filter, data), [data, filter]);
  const sorted = useMemo(() => sortTransactions(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const pageData = paginate(sorted, page, PAGE_SIZE);
  const tags = useMemo(() => allTags(data.transactions), [data.transactions]);
  const totals = useMemo(
    () => filtered.reduce((acc, t) => ({ income: acc.income + (t.type === 'income' ? t.amount : 0), expense: acc.expense + (t.type === 'expense' ? t.amount : 0) }), { income: 0, expense: 0 }),
    [filtered],
  );
  const active = hasActiveFilter(filter);

  useEffect(() => {
    if (page !== pageData.page) setPage(pageData.page);
  }, [page, pageData.page]);

  const remove = (tx: Transaction) => {
    const removed = removeTransaction(tx.id);
    if (!removed) return;
    toast({
      message: `Eliminaste «${describeTx(removed, data).title}» por ${formatCOP(removed.amount)}.`,
      action: { label: 'Deshacer', onClick: () => { restoreTransaction(removed); } },
    });
  };

  return (
    <>
      <PageHeader
        title="Movimientos"
        lead="Busca, filtra y corrige todo lo que has registrado."
        actions={<button type="button" className="btn btn--new-tx" onClick={onNew}><Icon name="plus" size={18} /> Nuevo movimiento</button>}
      />

      <section className="toolbar" aria-label="Búsqueda y orden">
        <div className="search">
          <Icon name="search" size={18} />
          <label htmlFor="buscar" className="sr-only">Buscar movimientos</label>
          <input id="buscar" type="search" className="input" placeholder="Buscar nota, categoría o etiqueta" value={filter.text} onChange={(e) => set('text', e.target.value)} />
        </div>
        <div className="toolbar__group">
          <label className="sr-only" htmlFor="orden">Ordenar por</label>
          <select id="orden" className="input" value={`${sortKey}:${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); setPage(1); }}>
            <option value="date:desc">Más recientes primero</option>
            <option value="date:asc">Más antiguos primero</option>
            <option value="amount:desc">Mayor monto primero</option>
            <option value="amount:asc">Menor monto primero</option>
          </select>
          <button type="button" className={`btn btn--ghost${showFilters ? ' is-on' : ''}`} aria-expanded={showFilters} aria-controls="panel-filtros" onClick={() => setShowFilters((v) => !v)}>
            <Icon name="filter" size={18} /> Filtros{active && <span className="pill-dot" aria-label="con filtros activos" />}
          </button>
        </div>
      </section>

      {showFilters && (
        <section id="panel-filtros" className="filters" aria-label="Filtros">
          <div className="field">
            <label htmlFor="f-type">Tipo</label>
            <select id="f-type" className="input" value={filter.type} onChange={(e) => set('type', e.target.value as TxType | '')}>
              <option value="">Todos</option>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
              <option value="transfer">Transferencias</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-acc">Cuenta</label>
            <select id="f-acc" className="input" value={filter.accountId} onChange={(e) => set('accountId', e.target.value)}>
              <option value="">Todas</option>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-cat">Categoría</label>
            <select id="f-cat" className="input" value={filter.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Todas</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-tag">Etiqueta</label>
            <select id="f-tag" className="input" value={filter.tag} onChange={(e) => set('tag', e.target.value)}>
              <option value="">Todas</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-from">Desde</label>
            <input id="f-from" type="date" className="input" value={filter.from} onChange={(e) => set('from', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-to">Hasta</label>
            <input id="f-to" type="date" className="input" value={filter.to} onChange={(e) => set('to', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-min">Monto mínimo</label>
            <input id="f-min" className="input" inputMode="numeric" placeholder="0" value={minText} onChange={(e) => { setMinText(e.target.value); set('minAmount', parseAmount(e.target.value)); }} />
          </div>
          <div className="field">
            <label htmlFor="f-max">Monto máximo</label>
            <input id="f-max" className="input" inputMode="numeric" placeholder="Sin tope" value={maxText} onChange={(e) => { setMaxText(e.target.value); set('maxAmount', parseAmount(e.target.value)); }} />
          </div>
          <div className="filters__actions">
            <button type="button" className="btn btn--ghost" onClick={clear} disabled={!active}>Limpiar filtros</button>
          </div>
        </section>
      )}

      {data.transactions.length === 0 ? (
        <EmptyState icon="list" title="Aún no hay movimientos" actions={<button type="button" className="btn" onClick={onNew}>Registrar el primero</button>}>
          Cada gasto, ingreso o transferencia que registres aparecerá aquí, con su categoría y etiquetas.
        </EmptyState>
      ) : sorted.length === 0 ? (
        <EmptyState icon="search" title="Ningún movimiento coincide" actions={<button type="button" className="btn btn--ghost" onClick={clear}>Limpiar filtros</button>}>
          Prueba con otro texto, amplía el rango de fechas o quita algún filtro.
        </EmptyState>
      ) : (
        <section className="panel panel--flush" aria-label="Lista de movimientos">
          <p className="summary" aria-live="polite">
            <span><strong data-testid="conteo">{sorted.length}</strong> {sorted.length === 1 ? 'movimiento' : 'movimientos'}</span>
            <span>Ingresos <Amount value={totals.income} tone="income" /></span>
            <span>Gastos <Amount value={totals.expense} tone="expense" /></span>
          </p>
          <TxTable txs={pageData.items} data={data} onEdit={onEdit} onDelete={remove} caption="Movimientos" />
          <nav className="pager" aria-label="Paginación">
            <button type="button" className="btn btn--ghost" onClick={() => setPage(pageData.page - 1)} disabled={pageData.page <= 1}>
              <Icon name="left" size={16} /> Anterior
            </button>
            <span className="muted">Página {pageData.page} de {pageData.pageCount}</span>
            <button type="button" className="btn btn--ghost" onClick={() => setPage(pageData.page + 1)} disabled={pageData.page >= pageData.pageCount}>
              Siguiente <Icon name="right" size={16} />
            </button>
          </nav>
        </section>
      )}
    </>
  );
}
