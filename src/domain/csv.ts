import { isValidISO, toISO } from './dates';
import { parseAmount } from './money';
import { parseTags } from './filters';
import type { Account, Category, Transaction, TxType } from './types';

/* ---------- Lectura de CSV (RFC 4180 con detección de separador) ---------- */

export interface CsvRecord {
  /** Línea física del archivo donde empieza el registro (base 1). */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  records: CsvRecord[];
  delimiter: string;
  error?: string;
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0] && counts[0][1] > 0 ? counts[0][0] : ',';
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quoteOpenedAt = 0;
  let touched = false;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (touched || cells.some((c) => c.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
    touched = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      quoteOpenedAt = line;
      touched = true;
    } else if (ch === delimiter) {
      touched = true;
      endCell();
    } else if (ch === '\r') {
      continue;
    } else if (ch === '\n') {
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      cell += ch;
      touched = true;
    }
  }
  if (inQuotes) {
    return { records, delimiter, error: `Hay comillas sin cerrar que empiezan en la línea ${quoteOpenedAt}.` };
  }
  if (cell !== '' || cells.length > 0 || touched) endRecord();
  return { records, delimiter };
}

/* ---------- Escritura ---------- */

const FORMULA_START = /^[=+@\t\r]/;

/** Escapa una celda y neutraliza fórmulas de hoja de cálculo (=, +, @). */
export function csvCell(value: string): string {
  let v = value;
  if (FORMULA_START.test(v)) v = `'${v}`;
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const toCsv = (rows: string[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const TYPE_LABEL: Record<TxType, string> = { income: 'ingreso', expense: 'gasto', transfer: 'transferencia' };

export const CSV_HEADERS = ['fecha', 'tipo', 'monto', 'cuenta', 'cuenta_destino', 'categoria', 'etiquetas', 'nota'];

export function exportTransactionsCsv(txs: readonly Transaction[], accounts: readonly Account[], categories: readonly Category[]): string {
  const accName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '';
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return toCsv([
    CSV_HEADERS,
    ...sorted.map((t) => [t.date, TYPE_LABEL[t.type], String(t.amount), accName(t.accountId), accName(t.toAccountId), catName(t.categoryId), t.tags.join('|'), t.note]),
  ]);
}

/* ---------- Importación ---------- */

export interface ImportRow {
  line: number;
  tx: Omit<Transaction, 'id'>;
  duplicate: boolean;
  newCategory?: { name: string; kind: 'income' | 'expense' };
}

export interface ImportError {
  line: number;
  message: string;
}

export interface ImportPlan {
  /** Error que impide leer el archivo completo (encabezados, comillas, archivo vacío). */
  fatal?: string;
  rows: ImportRow[];
  errors: ImportError[];
  newCategories: { name: string; kind: 'income' | 'expense' }[];
  /** Filas de datos leídas (válidas + con error). */
  totalRows: number;
}

export const MAX_IMPORT_ROWS = 5000;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const HEADER_ALIASES: Record<string, string> = {
  fecha: 'fecha',
  date: 'fecha',
  tipo: 'tipo',
  type: 'tipo',
  monto: 'monto',
  valor: 'monto',
  amount: 'monto',
  cuenta: 'cuenta',
  account: 'cuenta',
  cuenta_destino: 'cuenta_destino',
  destino: 'cuenta_destino',
  categoria: 'categoria',
  category: 'categoria',
  etiquetas: 'etiquetas',
  tags: 'etiquetas',
  nota: 'nota',
  descripcion: 'nota',
  note: 'nota',
};

const TYPE_ALIASES: Record<string, TxType> = {
  ingreso: 'income',
  income: 'income',
  gasto: 'expense',
  egreso: 'expense',
  expense: 'expense',
  transferencia: 'transfer',
  transfer: 'transfer',
};

/** Acepta AAAA-MM-DD, DD/MM/AAAA y DD-MM-AAAA. Devuelve null si no existe en el calendario. */
export function parseFlexibleDate(raw: string): string | null {
  const v = raw.trim();
  if (isValidISO(v)) return v;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (!m) return null;
  const iso = toISO(Number(m[3]), Number(m[2]), Number(m[1]));
  return isValidISO(iso) ? iso : null;
}

export function duplicateKey(tx: Omit<Transaction, 'id'>): string {
  return [tx.date, tx.type, tx.amount, tx.accountId, tx.toAccountId ?? '', norm(tx.note)].join('|');
}

const stripFormulaGuard = (v: string) => (/^'[=+@\t\r]/.test(v) ? v.slice(1) : v);

export function buildImportPlan(
  text: string,
  ctx: { accounts: readonly Account[]; categories: readonly Category[]; existing: readonly Transaction[] },
): ImportPlan {
  const empty: ImportPlan = { rows: [], errors: [], newCategories: [], totalRows: 0 };
  const parsed = parseCsv(text);
  if (parsed.error) return { ...empty, fatal: parsed.error };
  const [headerRec, ...dataRecords] = parsed.records;
  if (!headerRec) return { ...empty, fatal: 'El archivo está vacío.' };

  const columns = new Map<string, number>();
  headerRec.cells.forEach((h, idx) => {
    const key = HEADER_ALIASES[norm(h)];
    if (key && !columns.has(key)) columns.set(key, idx);
  });
  const missing = ['fecha', 'tipo', 'monto', 'cuenta'].filter((c) => !columns.has(c));
  if (missing.length > 0) {
    return { ...empty, fatal: `Faltan columnas obligatorias: ${missing.join(', ')}. Descarga la plantilla para ver el formato esperado.` };
  }
  if (dataRecords.length === 0) return { ...empty, fatal: 'El archivo tiene encabezados pero ninguna fila de datos.' };
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return { ...empty, fatal: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas por importación.` };
  }

  const cell = (rec: CsvRecord, col: string) => stripFormulaGuard((rec.cells[columns.get(col) ?? -1] ?? '').trim());
  const findAccount = (name: string) => ctx.accounts.find((a) => norm(a.name) === norm(name));
  const seen = new Set(ctx.existing.map((t) => duplicateKey(t)));
  const pendingCategories = new Map<string, { name: string; kind: 'income' | 'expense' }>();
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];

  for (const rec of dataRecords) {
    const problems: string[] = [];
    if (rec.cells.length > headerRec.cells.length) problems.push('tiene más columnas que el encabezado');

    const date = parseFlexibleDate(cell(rec, 'fecha'));
    if (!date) problems.push(`fecha inválida «${cell(rec, 'fecha')}» (usa AAAA-MM-DD o DD/MM/AAAA)`);

    const type = TYPE_ALIASES[norm(cell(rec, 'tipo'))];
    if (!type) problems.push(`tipo desconocido «${cell(rec, 'tipo')}» (usa ingreso, gasto o transferencia)`);

    const amount = parseAmount(cell(rec, 'monto'));
    if (amount === null) problems.push(`monto inválido «${cell(rec, 'monto')}» (debe ser un número mayor que cero)`);

    const account = findAccount(cell(rec, 'cuenta'));
    if (!account) problems.push(`la cuenta «${cell(rec, 'cuenta')}» no existe`);

    let toAccount: Account | undefined;
    let categoryName = '';
    let newCategory: ImportRow['newCategory'];
    let categoryId: string | undefined;

    if (type === 'transfer') {
      toAccount = findAccount(cell(rec, 'cuenta_destino'));
      if (!toAccount) problems.push(`la cuenta de destino «${cell(rec, 'cuenta_destino')}» no existe`);
      else if (account && toAccount.id === account.id) problems.push('el origen y el destino son la misma cuenta');
    } else if (type) {
      categoryName = cell(rec, 'categoria');
      if (!categoryName) problems.push('falta la categoría');
      else {
        const existing = ctx.categories.find((c) => norm(c.name) === norm(categoryName));
        if (existing && existing.kind !== type) problems.push(`la categoría «${categoryName}» es de ${existing.kind === 'income' ? 'ingresos' : 'gastos'}, no coincide con el tipo`);
        else if (existing) categoryId = existing.id;
        else {
          const key = `${type}:${norm(categoryName)}`;
          const other = pendingCategories.get(`${type === 'income' ? 'expense' : 'income'}:${norm(categoryName)}`);
          if (other) problems.push(`la categoría «${categoryName}» aparece como ingreso y como gasto`);
          newCategory = pendingCategories.get(key) ?? { name: categoryName, kind: type };
          pendingCategories.set(key, newCategory);
        }
      }
    }

    const note = cell(rec, 'nota');
    if (note.length > 120) problems.push('la nota supera 120 caracteres');

    if (problems.length > 0 || !date || !type || amount === null || !account) {
      errors.push({ line: rec.line, message: problems.join('; ') || 'fila inválida' });
      continue;
    }

    const tx: Omit<Transaction, 'id'> = {
      date,
      type,
      amount,
      accountId: account.id,
      ...(toAccount ? { toAccountId: toAccount.id } : {}),
      ...(categoryId ? { categoryId } : {}),
      tags: parseTags(cell(rec, 'etiquetas').replace(/\|/g, ' ')),
      note,
    };
    const key = duplicateKey(tx);
    const duplicate = seen.has(key);
    seen.add(key);
    rows.push({ line: rec.line, tx, duplicate, ...(newCategory ? { newCategory } : {}) });
  }

  return { rows, errors, newCategories: [...pendingCategories.values()], totalRows: dataRecords.length };
}

const IMPORT_COLORS = ['#7a6a4f', '#5f7f6e', '#a45c40', '#6b6f9a', '#8a8a5a', '#9a5f78'];

/** Convierte el plan en datos listos para guardar; crea las categorías nuevas necesarias. */
export function materializeImport(
  plan: ImportPlan,
  options: { includeDuplicates: boolean },
  makeId: (prefix: string) => string,
  existingCategories: readonly Category[],
): { transactions: Transaction[]; categories: Category[] } {
  const chosen = plan.rows.filter((r) => options.includeDuplicates || !r.duplicate);
  const created = new Map<string, Category>();
  let colorIdx = existingCategories.length;
  const transactions = chosen.map((row) => {
    let categoryId = row.tx.categoryId;
    if (row.newCategory) {
      const key = `${row.newCategory.kind}:${norm(row.newCategory.name)}`;
      let cat = created.get(key);
      if (!cat) {
        cat = { id: makeId('cat'), name: row.newCategory.name, kind: row.newCategory.kind, color: IMPORT_COLORS[colorIdx % IMPORT_COLORS.length]! };
        colorIdx += 1;
        created.set(key, cat);
      }
      categoryId = cat.id;
    }
    return { ...row.tx, ...(categoryId ? { categoryId } : {}), id: makeId('tx') } as Transaction;
  });
  return { transactions, categories: [...created.values()] };
}
