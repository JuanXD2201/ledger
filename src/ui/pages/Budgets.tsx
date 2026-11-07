import { useId, useMemo, useState, type FormEvent } from 'react';
import { budgetAlerts, budgetStatuses, effectiveBudgets, hasMonthOverrides } from '../../domain/budgets';
import { monthKey, shiftMonth } from '../../domain/dates';
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
  const [confirm, setConfirm] = useState<'copy' | 'reset' | null>(null);
  const { copyBudgets, resetBudgets } = useLedger();
  const toast = useToast();
  const next = shiftMonth(month, 1);

  const statuses = useMemo(() => budgetStatuses(data.budgets, data.transactions, month), [data, month]);
  const alerts = budgetAlerts(statuses);
  const catOf = (id: string) => data.categories.find((c) => c.id === id);
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  const free = data.categories.filter((c) => c.kind === 'expense' && !statuses.some((s) => s.categoryId === c.id));
  const overridden = (categoryId: string) => data.budgets.some((b) => b.month === month && b.categoryId === categoryId);
  const monthHasOverrides = hasMonthOverrides(data.budgets, month);

  const doCopy = () => {
    copyBudgets(month, next);
    toast({ message: `Presupuestos de ${formatMonth(month)} copiados a ${formatMonth(next)}.` });
    setConfirm(null);
  };
  const doReset = () => {
    resetBudgets(month);
    toast({ message: `Se quitaron los ajustes de ${formatMonth(month)}.` });
    setConfirm(null);
  };
  const onCopy = () => (hasMonthOverrides(data.budgets, next) ? setConfirm('copy') : doCopy());

  return (
    <>
      <PageHeader
        title="Presupuestos"
        lead="Un límite por categoría y por mes. Te avisamos al llegar al 80 % y al 100 %."
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} max={shiftMonth(monthKey(today), 1)} />
            <button type="button" className="btn" onClick={() => free[0] && setEditing({ categoryId: free[0].id })} disabled={free.length === 0}>
              <Icon name="plus" size={18} /> Nuevo presupuesto
            </button>
          </>
        }
      />

      {(statuses.length > 0 || monthHasOverrides) && (
        <div className="row budget-tools">
          <button type="button" className="btn btn--ghost" onClick={onCopy} disabled={statuses.length === 0} data-testid="copiar-mes">
            <Icon name="repeat" size={18} /> Copiar a {formatMonth(next)}
          </button>
          {monthHasOverrides && (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm('reset')}>Quitar ajustes de este mes</button>
          )}
        </div>
      )}

      {statuses.length === 0 ? (
        <EmptyState icon="target" title={`Sin presupuestos en ${formatMonth(month)}`} actions={free[0] && <button type="button" className="btn" onClick={() => setEditing({ categoryId: free[0]!.id })}>Crear el primero</button>}>
          Elige una categoría de gasto y fija cuánto quieres gastar este mes. También puedes copiar los presupuestos de otro mes con «Copiar a…».
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
                    <h2><i className="dot" style={{ background: cat?.color }} aria-hidden="true" /> {name}{overridden(s.categoryId) && <span className="tag-month">ajustado este mes</span>}</h2>
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

      <BudgetModal editing={editing} month={month} onClose={() => setEditing(null)} />

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'copy' ? 'Reemplazar presupuestos' : 'Quitar ajustes del mes'}>
        <div className="form">
          <p>
            {confirm === 'copy'
              ? `${formatMonth(next)} ya tiene presupuestos propios. Se reemplazarán por los de ${formatMonth(month)}.`
              : `Los presupuestos de ${formatMonth(month)} volverán a la plantilla base (los que no existan en ella desaparecerán de este mes).`}
          </p>
          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>Cancelar</button>
            <button type="button" className="btn btn--danger" onClick={confirm === 'copy' ? doCopy : doReset}>{confirm === 'copy' ? 'Reemplazar' : 'Quitar ajustes'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function BudgetModal({ editing, month, onClose }: { editing: { categoryId: string } | null; month: string; onClose: () => void }) {
  return (
    <Modal open={editing !== null} onClose={onClose} title={`Presupuesto de ${formatMonth(month)}`}>
      {editing && <BudgetForm initialCategory={editing.categoryId} month={month} onClose={onClose} />}
    </Modal>
  );
}

function BudgetForm({ initialCategory, month, onClose }: { initialCategory: string; month: string; onClose: () => void }) {
  const { data, setBudget } = useLedger();
  const toast = useToast();
  const uid = useId();
  const active = effectiveBudgets(data.budgets, month);
  const current = active.find((b) => b.categoryId === initialCategory);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [limitText, setLimitText] = useState(current ? String(current.limit) : '');
  const [error, setError] = useState('');
  const options = data.categories.filter((c) => c.kind === 'expense' && (c.id === initialCategory || !active.some((b) => b.categoryId === c.id)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const limit = parseAmount(limitText);
    if (limit === null) return setError('Ingresa un límite mensual mayor que cero.');
    setBudget(month, categoryId, limit);
    toast({ message: `Presupuesto guardado: ${formatCOP(limit)} para ${formatMonth(month)}.` });
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
        <label htmlFor={`${uid}-lim`}>Límite de {formatMonth(month)} (COP)</label>
        <input id={`${uid}-lim`} className="input input--amount" inputMode="numeric" autoFocus placeholder="500.000" value={limitText} aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined} onChange={(e) => { setLimitText(e.target.value); setError(''); }} />
        {error && <p className="field__error" id={`${uid}-err`}>{error}</p>}
      </div>
      <div className="form__actions">
        {current && (
          <button type="button" className="btn btn--danger-ghost" onClick={() => { setBudget(month, categoryId, null); toast({ message: `Presupuesto quitado de ${formatMonth(month)}.` }); onClose(); }}>Quitar de este mes</button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn">Guardar presupuesto</button>
      </div>
    </form>
  );
}
