import { isValidISO } from './dates';
import { MAX_AMOUNT } from './money';
import type { Account, Category, TxType } from './types';

export interface TxDraft {
  type: TxType;
  date: string;
  amount: number | null;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  note: string;
}

export type TxErrors = Partial<Record<keyof TxDraft, string>>;

/** Validación del formulario de movimientos; los mensajes se muestran tal cual. */
export function validateTxDraft(draft: TxDraft, ctx: { accounts: readonly Account[]; categories: readonly Category[] }): TxErrors {
  const errors: TxErrors = {};
  if (!isValidISO(draft.date)) errors.date = 'Escribe una fecha válida.';
  if (draft.amount === null || !Number.isFinite(draft.amount) || draft.amount <= 0) errors.amount = 'Ingresa un monto mayor que cero.';
  else if (draft.amount > MAX_AMOUNT) errors.amount = 'El monto es demasiado grande.';
  if (!ctx.accounts.some((a) => a.id === draft.accountId)) errors.accountId = 'Elige una cuenta.';
  if (draft.type === 'transfer') {
    if (!ctx.accounts.some((a) => a.id === draft.toAccountId)) errors.toAccountId = 'Elige la cuenta de destino.';
    else if (draft.toAccountId === draft.accountId) errors.toAccountId = 'El origen y el destino deben ser cuentas distintas.';
  } else {
    const cat = ctx.categories.find((c) => c.id === draft.categoryId);
    if (!cat) errors.categoryId = 'Elige una categoría.';
    else if (cat.kind !== draft.type) errors.categoryId = 'La categoría no corresponde al tipo de movimiento.';
  }
  if (draft.note.length > 120) errors.note = 'La nota admite hasta 120 caracteres.';
  return errors;
}
