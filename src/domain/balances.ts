import type { Account, ISODate, Transaction } from './types';

/** Efecto de un movimiento sobre el saldo de una cuenta. */
export function txEffect(tx: Transaction, accountId: string): number {
  switch (tx.type) {
    case 'income':
      return tx.accountId === accountId ? tx.amount : 0;
    case 'expense':
      return tx.accountId === accountId ? -tx.amount : 0;
    case 'transfer':
      return (tx.accountId === accountId ? -tx.amount : 0) + (tx.toAccountId === accountId ? tx.amount : 0);
  }
}

export function accountBalance(account: Account, txs: readonly Transaction[], upTo?: ISODate): number {
  let balance = account.openingBalance;
  for (const tx of txs) {
    if (upTo && tx.date > upTo) continue;
    balance += txEffect(tx, account.id);
  }
  return balance;
}

export function balancesById(accounts: readonly Account[], txs: readonly Transaction[], upTo?: ISODate): Record<string, number> {
  const result: Record<string, number> = {};
  for (const account of accounts) result[account.id] = account.openingBalance;
  for (const tx of txs) {
    if (upTo && tx.date > upTo) continue;
    if (tx.accountId in result) result[tx.accountId] = (result[tx.accountId] ?? 0) + txEffect(tx, tx.accountId);
    if (tx.type === 'transfer' && tx.toAccountId && tx.toAccountId in result) {
      result[tx.toAccountId] = (result[tx.toAccountId] ?? 0) + tx.amount;
    }
  }
  return result;
}

export const netWorth = (accounts: readonly Account[], txs: readonly Transaction[], upTo?: ISODate): number =>
  Object.values(balancesById(accounts, txs, upTo)).reduce((sum, value) => sum + value, 0);
