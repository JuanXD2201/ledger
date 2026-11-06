import { addDays, addMonthsClamped, parseISO } from './dates';
import type { ISODate, LedgerData, Recurring, Transaction } from './types';

const MAX_OCCURRENCES = 5000;

/**
 * Fechas de ocurrencia desde `startDate` hasta `upTo` (inclusive) y `endDate`.
 * Las mensuales se calculan siempre desde el día ancla, así el 31 de enero
 * seguido de febrero no arrastra el 28 a los meses siguientes.
 */
export function occurrences(rule: Pick<Recurring, 'frequency' | 'startDate' | 'endDate'>, upTo: ISODate): ISODate[] {
  const start = parseISO(rule.startDate);
  if (!start) return [];
  const limit = rule.endDate && rule.endDate < upTo ? rule.endDate : upTo;
  const result: ISODate[] = [];
  for (let k = 0; k < MAX_OCCURRENCES; k += 1) {
    const date = rule.frequency === 'weekly' ? addDays(rule.startDate, 7 * k) : addMonthsClamped(rule.startDate, k, start.d);
    if (date > limit) break;
    result.push(date);
  }
  return result;
}

/** Movimientos pendientes de generar hasta `today`, sin repetir los ya generados. */
export function generateDue(rule: Recurring, today: ISODate): { transactions: Transaction[]; generatedThrough?: ISODate } {
  const dates = occurrences(rule, today).filter((d) => !rule.generatedThrough || d > rule.generatedThrough);
  const transactions: Transaction[] = dates.map((date) => ({
    id: `rec-${rule.id}-${date}`,
    date,
    type: rule.type,
    amount: rule.amount,
    accountId: rule.accountId,
    categoryId: rule.categoryId,
    tags: [...rule.tags],
    note: rule.name,
    recurringId: rule.id,
  }));
  const last = dates[dates.length - 1];
  return { transactions, generatedThrough: last ?? rule.generatedThrough };
}

/** Aplica todas las reglas; es idempotente (ejecutarla dos veces no duplica nada). */
export function applyRecurring(data: LedgerData, today: ISODate): LedgerData {
  const existing = new Set(data.transactions.map((t) => t.id));
  const added: Transaction[] = [];
  const recurring = data.recurring.map((rule) => {
    const { transactions, generatedThrough } = generateDue(rule, today);
    for (const tx of transactions) {
      if (!existing.has(tx.id)) {
        existing.add(tx.id);
        added.push(tx);
      }
    }
    return generatedThrough === rule.generatedThrough ? rule : { ...rule, generatedThrough };
  });
  if (added.length === 0 && recurring.every((r, i) => r === data.recurring[i])) return data;
  return { ...data, recurring, transactions: [...data.transactions, ...added] };
}

/** Próxima fecha posterior a `from` en la que correrá la regla, o null si ya terminó. */
export function nextOccurrence(rule: Recurring, from: ISODate): ISODate | null {
  const horizon = addDays(from, 400);
  return occurrences(rule, horizon).find((d) => d > from) ?? null;
}
