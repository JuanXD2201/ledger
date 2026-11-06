import type { Account, Category, Transaction, TxType } from './types';

export interface TxFilter {
  text: string;
  from: string;
  to: string;
  categoryId: string;
  accountId: string;
  type: TxType | '';
  tag: string;
  minAmount: number | null;
  maxAmount: number | null;
}

export const emptyFilter = (): TxFilter => ({
  text: '',
  from: '',
  to: '',
  categoryId: '',
  accountId: '',
  type: '',
  tag: '',
  minAmount: null,
  maxAmount: null,
});

export const hasActiveFilter = (f: TxFilter): boolean => JSON.stringify(f) !== JSON.stringify(emptyFilter());

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterTransactions(
  txs: readonly Transaction[],
  f: TxFilter,
  lookup: { accounts: readonly Account[]; categories: readonly Category[] },
): Transaction[] {
  const needle = norm(f.text.trim());
  return txs.filter((tx) => {
    if (f.from && tx.date < f.from) return false;
    if (f.to && tx.date > f.to) return false;
    if (f.type && tx.type !== f.type) return false;
    if (f.categoryId && tx.categoryId !== f.categoryId) return false;
    if (f.accountId && tx.accountId !== f.accountId && tx.toAccountId !== f.accountId) return false;
    if (f.tag && !tx.tags.includes(f.tag)) return false;
    if (f.minAmount !== null && tx.amount < f.minAmount) return false;
    if (f.maxAmount !== null && tx.amount > f.maxAmount) return false;
    if (needle) {
      const cat = lookup.categories.find((c) => c.id === tx.categoryId)?.name ?? '';
      const acc = lookup.accounts.find((a) => a.id === tx.accountId)?.name ?? '';
      const haystack = norm(`${tx.note} ${cat} ${acc} ${tx.tags.join(' ')}`);
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export type SortKey = 'date' | 'amount';
export type SortDir = 'asc' | 'desc';

export function sortTransactions(txs: readonly Transaction[], key: SortKey, dir: SortDir): Transaction[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...txs].sort((a, b) => {
    const primary = key === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount;
    if (primary !== 0) return primary * sign;
    return a.id.localeCompare(b.id) * sign; // desempate estable
  });
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function paginate<T>(items: readonly T[], page: number, size: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount, total: items.length };
}

export const allTags = (txs: readonly Transaction[]): string[] =>
  [...new Set(txs.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'es'));

/** Normaliza etiquetas escritas a mano: minúsculas, sin # y sin repetidos. */
export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,;\s]+/).map((t) => t.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 8);
}
