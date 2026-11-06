import type { Account, Category, Transaction } from './types';

/** Datos mínimos reutilizables por las pruebas. */
export const accounts: Account[] = [
  { id: 'a-cash', name: 'Efectivo', type: 'cash', openingBalance: 100_000 },
  { id: 'a-bank', name: 'Banco', type: 'bank', openingBalance: 1_000_000 },
  { id: 'a-card', name: 'Tarjeta', type: 'credit', openingBalance: -200_000 },
];

export const categories: Category[] = [
  { id: 'c-food', name: 'Mercado', kind: 'expense', color: '#c9602f' },
  { id: 'c-fun', name: 'Ocio', kind: 'expense', color: '#d9a441' },
  { id: 'c-pay', name: 'Salario', kind: 'income', color: '#2f6b4f' },
];

let n = 0;
export function tx(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  n += 1;
  return { id: `t${n}`, type: 'expense', accountId: 'a-bank', categoryId: 'c-food', tags: [], note: '', ...partial };
}
