/** Tipos del dominio. Los montos son enteros en pesos colombianos (COP). */

export type ISODate = string; // 'AAAA-MM-DD'
export type MonthKey = string; // 'AAAA-MM'

export type AccountType = 'cash' | 'bank' | 'credit';
export type TxType = 'income' | 'expense' | 'transfer';
export type Frequency = 'weekly' | 'monthly';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Saldo inicial. En tarjetas de crédito, un valor negativo representa deuda. */
  openingBalance: number;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  color: string;
}

export interface Transaction {
  id: string;
  date: ISODate;
  type: TxType;
  /** Siempre positivo; el signo lo da el tipo. */
  amount: number;
  accountId: string;
  /** Solo en transferencias. */
  toAccountId?: string;
  categoryId?: string;
  tags: string[];
  note: string;
  recurringId?: string;
}

export interface Recurring {
  id: string;
  name: string;
  type: 'income' | 'expense';
  amount: number;
  accountId: string;
  categoryId: string;
  frequency: Frequency;
  startDate: ISODate;
  endDate?: ISODate;
  tags: string[];
  /** Última fecha ya generada; evita duplicar movimientos al recargar. */
  generatedThrough?: ISODate;
}

export interface Budget {
  categoryId: string;
  /** Límite mensual en COP. */
  limit: number;
}

export interface LedgerData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurring: Recurring[];
  budgets: Budget[];
}

export const emptyData = (): LedgerData => ({
  accounts: [],
  categories: [],
  transactions: [],
  recurring: [],
  budgets: [],
});
