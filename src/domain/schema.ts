import { isValidISO } from './dates';
import { MAX_AMOUNT } from './money';
import type { Account, Budget, Category, LedgerData, Recurring, Transaction } from './types';

/** Versión del esquema persistido. v1: sin etiquetas, recurrentes ni presupuestos. */
export const SCHEMA_VERSION = 2;

export interface Envelope {
  schemaVersion: number;
  data: unknown;
}

export type ReadResult = { ok: true; data: LedgerData; migratedFrom?: number } | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Pasa los datos de una versión anterior a la actual. */
export function migrate(version: number, data: unknown): unknown {
  if (!isRec(data)) return data;
  let current: Rec = data;
  if (version < 2) {
    current = {
      ...current,
      categories: Array.isArray(current.categories)
        ? current.categories.map((c) => (isRec(c) ? { color: '#8a8a7a', ...c } : c))
        : current.categories,
      transactions: Array.isArray(current.transactions) ? current.transactions.map((t) => (isRec(t) ? { tags: [], note: '', ...t } : t)) : current.transactions,
      recurring: [],
      budgets: [],
    };
  }
  return current;
}

/** Valida estructura e integridad referencial. Devuelve datos tipados o la lista de problemas. */
export function validateData(input: unknown): ReadResult {
  const errors: string[] = [];
  const fail = (msg: string) => {
    if (errors.length < 15) errors.push(msg);
  };
  if (!isRec(input)) return { ok: false, errors: ['El contenido no tiene la forma esperada.'] };
  for (const key of ['accounts', 'categories', 'transactions', 'recurring', 'budgets']) {
    if (!Array.isArray(input[key])) fail(`Falta la lista «${key}».`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const accounts: Account[] = [];
  const categories: Category[] = [];
  const transactions: Transaction[] = [];
  const recurring: Recurring[] = [];
  const budgets: Budget[] = [];
  const ids = new Set<string>();
  const unique = (kind: string, id: string) => {
    const key = `${kind}:${id}`;
    if (ids.has(key)) fail(`Identificador repetido en ${kind}: ${id}.`);
    ids.add(key);
  };

  (input.accounts as unknown[]).forEach((a, i) => {
    if (!isRec(a) || !isStr(a.id) || !isStr(a.name) || !isInt(a.openingBalance) || !['cash', 'bank', 'credit'].includes(a.type as string)) {
      return fail(`Cuenta ${i + 1}: datos incompletos o inválidos.`);
    }
    unique('cuentas', a.id);
    accounts.push({ id: a.id, name: a.name, type: a.type as Account['type'], openingBalance: a.openingBalance });
  });
  (input.categories as unknown[]).forEach((c, i) => {
    if (!isRec(c) || !isStr(c.id) || !isStr(c.name) || !isStr(c.color) || !['income', 'expense'].includes(c.kind as string)) {
      return fail(`Categoría ${i + 1}: datos incompletos o inválidos.`);
    }
    unique('categorías', c.id);
    categories.push({ id: c.id, name: c.name, kind: c.kind as Category['kind'], color: c.color });
  });
  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const tagsOk = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

  (input.transactions as unknown[]).forEach((t, i) => {
    const label = `Movimiento ${i + 1}`;
    if (!isRec(t) || !isStr(t.id) || !isStr(t.date) || !isInt(t.amount) || !isStr(t.accountId) || !isStr(t.note) || !tagsOk(t.tags)) return fail(`${label}: datos incompletos.`);
    if (!['income', 'expense', 'transfer'].includes(t.type as string)) return fail(`${label}: tipo desconocido.`);
    if (!isValidISO(t.date)) return fail(`${label}: fecha inválida (${t.date}).`);
    if (t.amount <= 0 || t.amount > MAX_AMOUNT) return fail(`${label}: monto fuera de rango.`);
    if (!accountIds.has(t.accountId)) return fail(`${label}: la cuenta no existe.`);
    if (t.type === 'transfer') {
      if (!isStr(t.toAccountId) || !accountIds.has(t.toAccountId) || t.toAccountId === t.accountId) return fail(`${label}: cuenta de destino inválida.`);
    } else if (!isStr(t.categoryId) || !categoryIds.has(t.categoryId)) return fail(`${label}: la categoría no existe.`);
    unique('movimientos', t.id);
    transactions.push({
      id: t.id,
      date: t.date,
      type: t.type as Transaction['type'],
      amount: t.amount,
      accountId: t.accountId,
      ...(t.type === 'transfer' ? { toAccountId: t.toAccountId as string } : { categoryId: t.categoryId as string }),
      tags: t.tags,
      note: t.note,
      ...(isStr(t.recurringId) ? { recurringId: t.recurringId } : {}),
    });
  });

  (input.recurring as unknown[]).forEach((r, i) => {
    const label = `Recurrente ${i + 1}`;
    if (!isRec(r) || !isStr(r.id) || !isStr(r.name) || !isInt(r.amount) || !isStr(r.accountId) || !isStr(r.categoryId) || !isStr(r.startDate) || !tagsOk(r.tags)) return fail(`${label}: datos incompletos.`);
    if (!['income', 'expense'].includes(r.type as string) || !['weekly', 'monthly'].includes(r.frequency as string)) return fail(`${label}: tipo o frecuencia inválidos.`);
    if (!isValidISO(r.startDate) || (r.endDate !== undefined && (!isStr(r.endDate) || !isValidISO(r.endDate)))) return fail(`${label}: fechas inválidas.`);
    if (r.amount <= 0 || !accountIds.has(r.accountId) || !categoryIds.has(r.categoryId)) return fail(`${label}: monto, cuenta o categoría inválidos.`);
    unique('recurrentes', r.id);
    recurring.push({
      id: r.id,
      name: r.name,
      type: r.type as Recurring['type'],
      amount: r.amount,
      accountId: r.accountId,
      categoryId: r.categoryId,
      frequency: r.frequency as Recurring['frequency'],
      startDate: r.startDate,
      ...(isStr(r.endDate) ? { endDate: r.endDate } : {}),
      tags: r.tags,
      ...(isStr(r.generatedThrough) && isValidISO(r.generatedThrough) ? { generatedThrough: r.generatedThrough } : {}),
    });
  });

  (input.budgets as unknown[]).forEach((b, i) => {
    if (!isRec(b) || !isStr(b.categoryId) || !isInt(b.limit) || b.limit <= 0 || !categoryIds.has(b.categoryId)) return fail(`Presupuesto ${i + 1}: datos inválidos.`);
    budgets.push({ categoryId: b.categoryId, limit: b.limit });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: { accounts, categories, transactions, recurring, budgets } };
}

/** Lee un sobre persistido o un respaldo: comprueba versión, migra y valida. */
export function readEnvelope(raw: unknown): ReadResult {
  if (!isRec(raw)) return { ok: false, errors: ['El archivo no contiene un objeto JSON válido.'] };
  const version = raw.schemaVersion;
  if (!isInt(version) || !Number.isInteger(version) || version < 1) return { ok: false, errors: ['No se encontró la versión del esquema.'] };
  if (version > SCHEMA_VERSION) {
    return { ok: false, errors: [`El archivo usa el esquema v${version}, más nuevo que el soportado (v${SCHEMA_VERSION}).`] };
  }
  const result = validateData(migrate(version, raw.data));
  return result.ok && version < SCHEMA_VERSION ? { ...result, migratedFrom: version } : result;
}

export const toEnvelope = (data: LedgerData): Envelope => ({ schemaVersion: SCHEMA_VERSION, data });

/* ---------- Respaldo JSON ---------- */

export interface BackupFile extends Envelope {
  app: 'ledger';
  exportedAt: string;
}

export const createBackup = (data: LedgerData, now: Date = new Date()): BackupFile => ({
  app: 'ledger',
  ...toEnvelope(data),
  exportedAt: now.toISOString(),
});

export function parseBackup(text: string): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['El archivo no es un JSON válido.'] };
  }
  if (!isRec(raw) || raw.app !== 'ledger') return { ok: false, errors: ['El archivo no es un respaldo de Ledger.'] };
  return readEnvelope(raw);
}
