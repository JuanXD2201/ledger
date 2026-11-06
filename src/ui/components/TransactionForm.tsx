import { useId, useRef, useState, type FormEvent } from 'react';
import { budgetStatuses } from '../../domain/budgets';
import { monthKey } from '../../domain/dates';
import { parseTags } from '../../domain/filters';
import { formatCOP, formatNumber, formatPercent } from '../../domain/format';
import { parseAmount } from '../../domain/money';
import type { Transaction, TxType } from '../../domain/types';
import { validateTxDraft, type TxDraft, type TxErrors } from '../../domain/validation';
import { useLedger } from '../store';
import { useToast } from '../toast';
import { Modal } from './Modal';

const TYPES: { value: TxType; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'transfer', label: 'Transferencia' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Transaction | null;
}

export function TransactionForm({ open, onClose, editing }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <FormBody onClose={onClose} editing={editing ?? null} />
    </Modal>
  );
}

function FormBody({ onClose, editing }: { onClose: () => void; editing: Transaction | null }) {
  const { data, today, addTransaction, updateTransaction } = useLedger();
  const toast = useToast();
  const uid = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TxType>(editing?.type ?? 'expense');
  const [amountText, setAmountText] = useState(editing ? formatNumber(editing.amount) : '');
  const [date, setDate] = useState(editing?.date ?? today);
  const [accountId, setAccountId] = useState(editing?.accountId ?? data.accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [tagsText, setTagsText] = useState(editing?.tags.join(', ') ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<TxErrors>({});

  const categoriesForType = data.categories.filter((c) => c.kind === type);
  const effectiveCategory = categoriesForType.some((c) => c.id === categoryId) ? categoryId : (categoriesForType[0]?.id ?? '');
  const id = (name: string) => `${uid}-${name}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const draft: TxDraft = {
      type,
      date,
      amount: parseAmount(amountText),
      accountId,
      toAccountId,
      categoryId: type === 'transfer' ? '' : effectiveCategory,
      note: note.trim(),
    };
    const found = validateTxDraft(draft, data);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0]!;
      (document.getElementById(id(first)) as HTMLElement | null)?.focus();
      return;
    }
    const base: Omit<Transaction, 'id'> = {
      date,
      type,
      amount: draft.amount!,
      accountId,
      ...(type === 'transfer' ? { toAccountId } : { categoryId: effectiveCategory }),
      tags: parseTags(tagsText),
      note: draft.note,
      ...(editing?.recurringId ? { recurringId: editing.recurringId } : {}),
    };
    const saved: Transaction = editing ? { ...base, id: editing.id } : { ...base, id: 'pendiente' };
    if (editing) updateTransaction(saved);
    else addTransaction(base);
    onClose();

    if (type === 'expense') {
      const others = data.transactions.filter((t) => t.id !== editing?.id);
      const status = budgetStatuses(data.budgets, [...others, saved], monthKey(date)).find((s) => s.categoryId === effectiveCategory);
      const name = data.categories.find((c) => c.id === effectiveCategory)?.name ?? 'La categoría';
      if (status?.level === 'exceeded') {
        toast({ tone: 'error', message: `Presupuesto de ${name}: límite ${status.spent === status.limit ? 'alcanzado' : 'superado'} (${formatCOP(status.spent)} de ${formatCOP(status.limit)}).` });
        return;
      }
      if (status?.level === 'warning') {
        toast({ tone: 'warn', message: `Presupuesto de ${name} al ${formatPercent(status.ratio)}: te quedan ${formatCOP(status.remaining)}.` });
        return;
      }
    }
    toast({ message: editing ? 'Cambios guardados.' : 'Movimiento guardado.' });
  };

  const err = (name: keyof TxErrors) => errors[name];
  const aria = (name: keyof TxErrors) => ({ id: id(name), 'aria-invalid': err(name) ? true : undefined, 'aria-describedby': err(name) ? id(`${name}-err`) : undefined });
  const msg = (name: keyof TxErrors) => (err(name) ? <p className="field__error" id={id(`${name}-err`)}>{err(name)}</p> : null);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="segmented" role="radiogroup" aria-label="Tipo de movimiento">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            className={`segmented__item segmented__item--${t.value}${type === t.value ? ' is-active' : ''}`}
            onClick={() => setType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor={id('amount')}>Monto (COP)</label>
        <input
          {...aria('amount')}
          ref={firstFieldRef}
          className="input input--amount"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          onBlur={() => {
            const n = parseAmount(amountText);
            if (n !== null) setAmountText(formatNumber(n));
          }}
        />
        {msg('amount')}
      </div>

      <div className="form__row">
        <div className="field">
          <label htmlFor={id('date')}>Fecha</label>
          <input {...aria('date')} className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {msg('date')}
        </div>
        <div className="field">
          <label htmlFor={id('accountId')}>{type === 'transfer' ? 'Desde la cuenta' : 'Cuenta'}</label>
          <select {...aria('accountId')} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {data.accounts.length === 0 && <option value="">Sin cuentas</option>}
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {msg('accountId')}
        </div>
      </div>

      {type === 'transfer' ? (
        <div className="field">
          <label htmlFor={id('toAccountId')}>Hacia la cuenta</label>
          <select {...aria('toAccountId')} className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Elige un destino…</option>
            {data.accounts.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {msg('toAccountId')}
        </div>
      ) : (
        <div className="field">
          <label htmlFor={id('categoryId')}>Categoría</label>
          <select {...aria('categoryId')} className="input" value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value)}>
            {categoriesForType.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {msg('categoryId')}
        </div>
      )}

      <div className="form__row">
        <div className="field">
          <label htmlFor={id('tags')}>Etiquetas</label>
          <input id={id('tags')} className="input" value={tagsText} placeholder="hogar, viaje" onChange={(e) => setTagsText(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id('note')}>Nota</label>
          <input {...aria('note')} className="input" value={note} maxLength={140} placeholder="Opcional" onChange={(e) => setNote(e.target.value)} />
          {msg('note')}
        </div>
      </div>

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn">{editing ? 'Guardar cambios' : 'Guardar movimiento'}</button>
      </div>
    </form>
  );
}
