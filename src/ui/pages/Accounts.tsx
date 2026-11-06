import { useId, useMemo, useState, type FormEvent } from 'react';
import { balancesById } from '../../domain/balances';
import { isValidISO } from '../../domain/dates';
import { parseTags } from '../../domain/filters';
import { formatDateFull } from '../../domain/format';
import { makeId } from '../../domain/ids';
import { parseAmount } from '../../domain/money';
import { nextOccurrence } from '../../domain/recurrence';
import type { Account, AccountType, Frequency, Recurring } from '../../domain/types';
import { Amount, EmptyState, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useLedger } from '../store';
import { useToast } from '../toast';

const TYPE_LABEL: Record<AccountType, string> = { cash: 'Efectivo', bank: 'Banco', credit: 'Tarjeta de crédito' };
const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Cada semana', monthly: 'Cada mes' };

export function Accounts() {
  const { data, today, removeAccount, removeRecurring } = useLedger();
  const toast = useToast();
  const [accountModal, setAccountModal] = useState<Account | 'new' | null>(null);
  const [ruleModal, setRuleModal] = useState<Recurring | 'new' | null>(null);
  const balances = useMemo(() => balancesById(data.accounts, data.transactions, today), [data, today]);
  const total = Object.values(balances).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Cuentas" lead="Donde vive tu dinero y los movimientos que se repiten solos." actions={<button type="button" className="btn" onClick={() => setAccountModal('new')}><Icon name="plus" size={18} /> Nueva cuenta</button>} />

      <section className="panel" aria-labelledby="h-cuentas">
        <h2 id="h-cuentas" className="h-serif">Tus cuentas</h2>
        {data.accounts.length === 0 ? (
          <EmptyState icon="wallet" title="No tienes cuentas" actions={<button type="button" className="btn" onClick={() => setAccountModal('new')}>Crear una cuenta</button>}>Crea al menos una cuenta (efectivo, banco o tarjeta) para registrar movimientos.</EmptyState>
        ) : (
          <ul className="account-list">
            {data.accounts.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                  <span className="muted small">{TYPE_LABEL[a.type]}{a.type === 'credit' && (balances[a.id] ?? 0) < 0 ? ' · deuda' : ''}</span>
                </div>
                <Amount value={balances[a.id] ?? 0} />
                <div className="row-actions">
                  <button type="button" className="icon-btn" aria-label={`Editar ${a.name}`} onClick={() => setAccountModal(a)}><Icon name="edit" size={18} /></button>
                  <button type="button" className="icon-btn icon-btn--danger" aria-label={`Eliminar ${a.name}`} onClick={() => { const msg = removeAccount(a.id); toast(msg ? { tone: 'error', message: msg } : { message: `Cuenta «${a.name}» eliminada.` }); }}><Icon name="trash" size={18} /></button>
                </div>
              </li>
            ))}
            <li className="account-list__total"><strong>Total</strong><Amount value={total} /><span /></li>
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="h-rec">
        <div className="panel__head">
          <h2 id="h-rec" className="h-serif">Movimientos recurrentes</h2>
          <button type="button" className="btn btn--ghost" onClick={() => setRuleModal('new')} disabled={data.accounts.length === 0}><Icon name="plus" size={18} /> Nuevo recurrente</button>
        </div>
        {data.recurring.length === 0 ? (
          <p className="muted">Programa tu salario, el arriendo o una suscripción y Ledger los registra por ti cada semana o cada mes.</p>
        ) : (
          <ul className="account-list">
            {data.recurring.map((r) => {
              const next = nextOccurrence(r, today);
              return (
                <li key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    <span className="muted small">{FREQ_LABEL[r.frequency]} · {next ? `próximo ${formatDateFull(next)}` : 'finalizado'}</span>
                  </div>
                  <Amount value={r.amount} tone={r.type} signed />
                  <div className="row-actions">
                    <button type="button" className="icon-btn" aria-label={`Editar ${r.name}`} onClick={() => setRuleModal(r)}><Icon name="edit" size={18} /></button>
                    <button type="button" className="icon-btn icon-btn--danger" aria-label={`Eliminar ${r.name}`} onClick={() => { removeRecurring(r.id); toast({ message: `«${r.name}» ya no se repetirá. Los movimientos anteriores se conservan.` }); }}><Icon name="trash" size={18} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={accountModal !== null} onClose={() => setAccountModal(null)} title={accountModal === 'new' ? 'Nueva cuenta' : 'Editar cuenta'}>
        {accountModal && <AccountForm editing={accountModal === 'new' ? null : accountModal} onClose={() => setAccountModal(null)} />}
      </Modal>
      <Modal open={ruleModal !== null} onClose={() => setRuleModal(null)} title={ruleModal === 'new' ? 'Nuevo movimiento recurrente' : 'Editar recurrente'}>
        {ruleModal && <RuleForm editing={ruleModal === 'new' ? null : ruleModal} onClose={() => setRuleModal(null)} />}
      </Modal>
    </>
  );
}

function AccountForm({ editing, onClose }: { editing: Account | null; onClose: () => void }) {
  const { saveAccount } = useLedger();
  const toast = useToast();
  const uid = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<AccountType>(editing?.type ?? 'bank');
  const [openingText, setOpeningText] = useState(editing ? String(Math.abs(editing.openingBalance)) : '0');
  const [debt, setDebt] = useState((editing?.openingBalance ?? 0) < 0 || type === 'credit');
  const [errors, setErrors] = useState<{ name?: string; opening?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!name.trim()) found.name = 'Ponle un nombre a la cuenta.';
    const trimmed = openingText.trim();
    const amount = trimmed === '' || trimmed === '0' ? 0 : parseAmount(trimmed);
    if (amount === null) found.opening = 'Escribe un saldo válido, sin signos.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const signed = type === 'credit' || debt ? -(amount ?? 0) : (amount ?? 0);
    saveAccount({ id: editing?.id ?? makeId('acc'), name: name.trim().slice(0, 40), type, openingBalance: signed });
    toast({ message: editing ? 'Cuenta actualizada.' : 'Cuenta creada.' });
    onClose();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-n`}>Nombre</label>
        <input id={`${uid}-n`} className="input" autoFocus value={name} maxLength={40} aria-invalid={errors.name ? true : undefined} onChange={(e) => setName(e.target.value)} placeholder="Cuenta de ahorros" />
        {errors.name && <p className="field__error">{errors.name}</p>}
      </div>
      <div className="form__row">
        <div className="field">
          <label htmlFor={`${uid}-t`}>Tipo</label>
          <select id={`${uid}-t`} className="input" value={type} onChange={(e) => { const t = e.target.value as AccountType; setType(t); setDebt(t === 'credit'); }}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-o`}>{type === 'credit' ? 'Deuda inicial (COP)' : 'Saldo inicial (COP)'}</label>
          <input id={`${uid}-o`} className="input input--amount" inputMode="numeric" value={openingText} aria-invalid={errors.opening ? true : undefined} onChange={(e) => setOpeningText(e.target.value)} />
          {errors.opening && <p className="field__error">{errors.opening}</p>}
        </div>
      </div>
      {type !== 'credit' && (
        <label className="check"><input type="checkbox" checked={debt} onChange={(e) => setDebt(e.target.checked)} /> El saldo inicial es una deuda (negativo)</label>
      )}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn">{editing ? 'Guardar cambios' : 'Crear cuenta'}</button>
      </div>
    </form>
  );
}

function RuleForm({ editing, onClose }: { editing: Recurring | null; onClose: () => void }) {
  const { data, today, saveRecurring } = useLedger();
  const toast = useToast();
  const uid = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<'income' | 'expense'>(editing?.type ?? 'expense');
  const [amountText, setAmountText] = useState(editing ? String(editing.amount) : '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? data.accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(editing?.startDate ?? today);
  const [endDate, setEndDate] = useState(editing?.endDate ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cats = data.categories.filter((c) => c.kind === type);
  const effectiveCat = cats.some((c) => c.id === categoryId) ? categoryId : (cats[0]?.id ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    const amount = parseAmount(amountText);
    if (!name.trim()) found.name = 'Ponle un nombre, por ejemplo «Arriendo».';
    if (amount === null) found.amount = 'Ingresa un monto mayor que cero.';
    if (!isValidISO(startDate)) found.start = 'Escribe una fecha de inicio válida.';
    if (endDate && (!isValidISO(endDate) || endDate < startDate)) found.end = 'La fecha final debe ser posterior al inicio.';
    if (!effectiveCat) found.cat = 'Elige una categoría.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const rule: Recurring = {
      id: editing?.id ?? makeId('rec'),
      name: name.trim().slice(0, 60),
      type,
      amount: amount!,
      accountId,
      categoryId: effectiveCat,
      frequency,
      startDate,
      ...(endDate ? { endDate } : {}),
      tags: editing?.tags ?? parseTags(''),
      // al cambiar la fecha de inicio se vuelve a calcular lo pendiente sin duplicar ids ya existentes
      ...(editing && editing.startDate === startDate && editing.frequency === frequency && editing.generatedThrough ? { generatedThrough: editing.generatedThrough } : {}),
    };
    saveRecurring(rule);
    toast({ message: `«${rule.name}» guardado. Se registra ${frequency === 'weekly' ? 'cada semana' : 'cada mes'}${rule.startDate <= today ? '; ya se generaron los movimientos hasta hoy' : ''}.` });
    onClose();
  };
  const err = (k: string) => (errors[k] ? <p className="field__error">{errors[k]}</p> : null);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-n`}>Nombre</label>
        <input id={`${uid}-n`} className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Arriendo del apartamento" />
        {err('name')}
      </div>
      <div className="form__row">
        <div className="field">
          <label htmlFor={`${uid}-t`}>Tipo</label>
          <select id={`${uid}-t`} className="input" value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-a`}>Monto (COP)</label>
          <input id={`${uid}-a`} className="input input--amount" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="1.350.000" />
          {err('amount')}
        </div>
      </div>
      <div className="form__row">
        <div className="field">
          <label htmlFor={`${uid}-ac`}>Cuenta</label>
          <select id={`${uid}-ac`} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-c`}>Categoría</label>
          <select id={`${uid}-c`} className="input" value={effectiveCat} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {err('cat')}
        </div>
      </div>
      <div className="form__row">
        <div className="field">
          <label htmlFor={`${uid}-f`}>Frecuencia</label>
          <select id={`${uid}-f`} className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            <option value="monthly">Cada mes</option>
            <option value="weekly">Cada semana</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-s`}>Empieza el</label>
          <input id={`${uid}-s`} className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          {err('start')}
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-e`}>Termina el (opcional)</label>
        <input id={`${uid}-e`} className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        {err('end')}
      </div>
      <p className="muted small">Si la fecha de inicio es pasada, se registran de una vez los movimientos que ya correspondían hasta hoy, sin duplicados.</p>
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn">{editing ? 'Guardar cambios' : 'Crear recurrente'}</button>
      </div>
    </form>
  );
}
