import { useId, useMemo, useState, type FormEvent } from 'react';
import { budgetAlerts, budgetStatuses } from '../../domain/budgets';
import { monthKey } from '../../domain/dates';
import { formatCOP, formatMonth, formatPercent } from '../../domain/format';
import { parseAmount } from '../../domain/money';
import { EmptyState, LevelBadge, MonthPicker, PageHeader, ProgressBar } from '../components/common';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useLedger } from '../store';
import { useToast } from '../toast';

export function Budgets() {
  const { data, today } = useLedger();
  const [month, setMonth] = useState(monthKey(today));
  const [editing, setEditing] = useState<{ categoryId: string } | null>(null);

  const statuses = useMemo(() => budgetStatuses(data.budgets, data.transactions, month), [data, month]);
  const alerts = budgetAlerts(statuses);
  const catOf = (id: string) => data.categories.find((c) => c.id === id);
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  const free = data.categories.filter((c) => c.kind === 'expense' && !data.budgets.some((b) => b.categoryId === c.id));

  return (
    <>
      <PageHeader
        title="Presupuestos"
        lead="Un límite mensual por categoría. Te avisamos al llegar al 80 % y al 100 %."
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} max={monthKey(today)} />
            <button type="button" className="btn" onClick={() => free[0] && setEditing({ categoryId: free[0].id })} disabled={free.length === 0}>
              <Icon name="plus" size={18} /> Nuevo presupuesto
            </button>
          </>
        }
      />

      {statuses.length === 0 ? (
        <EmptyState icon="target" title="Aún no defines presupuestos" actions={free[0] && <button type="button" className="btn" onClick={() => setEditing({ categoryId: free[0]!.id })}>Crear el primero</button>}>
          Elige una categoría de gasto y fija cuánto quieres gastar al mes. La barra de progreso te mostrará cómo vas.
        </EmptyState>
      ) : (
        <>
          <div className={`banner${alerts.length > 0 ? ' banner--alert' : ''}`} role="status">
            <Icon name={alerts.length > 0 ? 'alert' : 'check'} size={20} />
            <p>
              {alerts.length === 0
                ? `Todo en orden en ${formatMonth(month)}: has gastado ${formatCOP(totalSpent)} de ${formatCOP(totalLimit)} presupuestados.`
                : `${alerts.length} ${alerts.length === 1 ? 'presupuesto requiere' : 'presupuestos requieren'} atención en ${formatMonth(month)}: ${alerts.map((a) => catOf(a.categoryId)?.name).join(', ')}.`}
            </p>
          </div>

          <ul className="budget-list" aria-label="Presupuestos por categoría">
            {statuses.map((s) => {
              const cat = catOf(s.categoryId);
              const name = cat?.name ?? 'Categoría';
              return (
                <li key={s.categoryId} className={`budget budget--${s.level}`} data-testid={`presupuesto-${s.categoryId}`}>
                  <div className="budget__head">
                    <h2><i className="dot" style={{ background: cat?.color }} aria-hidden="true" /> {name}</h2>
                    <div className="budget__tools">
                      <button type="button" className="icon-btn" aria-label={`Editar presupuesto de ${name}`} onClick={() => setEditing({ categoryId: s.categoryId })}>
                        <Icon name="edit" size={18} />
                      </button>
                    </div>
                  </div>
                  <ProgressBar ratio={s.ratio} level={s.level} label={`Presupuesto de ${name}`} />
                  <div className="budget__foot">
                    <span className="num">{formatCOP(s.spent)} <span className="muted">de {formatCOP(s.limit)}</span></span>
                    <span className="budget__pct num">{formatPercent(s.ratio)}</span>
                  </div>
                  <div className="budget__foot">
                    <span className="muted">{s.remaining >= 0 ? `Disponible ${formatCOP(s.remaining)}` : `Te pasaste por ${formatCOP(-s.remaining)}`}</span>
                    <LevelBadge level={s.level} ratio={s.ratio} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <BudgetModal editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function BudgetModal({ editing, onClose }: { editing: { categoryId: string } | null; onClose: () => void }) {
  return (
    <Modal open={editing !== null} onClose={onClose} title="Presupuesto mensual">
      {editing && <BudgetForm initialCategory={editing.categoryId} onClose={onClose} />}
    </Modal>
  );
}

function BudgetForm({ initialCategory, onClose }: { initialCategory: string; onClose: () => void }) {
  const { data, setBudget } = useLedger();
  const toast = useToast();
  const uid = useId();
  const current = data.budgets.find((b) => b.categoryId === initialCategory);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [limitText, setLimitText] = useState(current ? String(current.limit) : '');
  const [error, setError] = useState('');
  const options = data.categories.filter((c) => c.kind === 'expense' && (c.id === initialCategory || !data.budgets.some((b) => b.categoryId === c.id)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const limit = parseAmount(limitText);
    if (limit === null) return setError('Ingresa un límite mensual mayor que cero.');
    setBudget(categoryId, limit);
    toast({ message: `Presupuesto guardado: ${formatCOP(limit)} al mes.` });
    onClose();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-cat`}>Categoría</label>
        <select id={`${uid}-cat`} className="input" value={categoryId} disabled={Boolean(current)} onChange={(e) => setCategoryId(e.target.value)}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-lim`}>Límite mensual (COP)</label>
        <input id={`${uid}-lim`} className="input input--amount" inputMode="numeric" autoFocus placeholder="500.000" value={limitText} aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined} onChange={(e) => { setLimitText(e.target.value); setError(''); }} />
        {error && <p className="field__error" id={`${uid}-err`}>{error}</p>}
      </div>
      <div className="form__actions">
        {current && (
          <button type="button" className="btn btn--danger-ghost" onClick={() => { setBudget(categoryId, null); toast({ message: 'Presupuesto eliminado.' }); onClose(); }}>Eliminar</button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn">Guardar presupuesto</button>
      </div>
    </form>
  );
}
