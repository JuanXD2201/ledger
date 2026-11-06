import type { ISODate, MonthKey } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month: 1-12
}

export function parseISO(value: string): { y: number; m: number; d: number } | null {
  const match = ISO_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isValidISO = (value: string): boolean => parseISO(value) !== null;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const toISO = (y: number, m: number, d: number): ISODate => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function fromUtc(ms: number): ISODate {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function toUtc(date: ISODate): number {
  const p = parseISO(date);
  if (!p) throw new Error(`Fecha inválida: ${date}`);
  return Date.UTC(p.y, p.m - 1, p.d);
}

export const addDays = (date: ISODate, days: number): ISODate => fromUtc(toUtc(date) + days * 86_400_000);

export const diffDays = (a: ISODate, b: ISODate): number => Math.round((toUtc(a) - toUtc(b)) / 86_400_000);

export const monthKey = (date: ISODate): MonthKey => date.slice(0, 7);

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [ys, ms] = key.split('-');
  const idx = Number(ys) * 12 + (Number(ms) - 1) + delta;
  return `${pad(Math.floor(idx / 12), 4)}-${pad((idx % 12) + 1)}`;
}

export const monthStart = (key: MonthKey): ISODate => `${key}-01`;

export function monthEnd(key: MonthKey): ISODate {
  const [ys, ms] = key.split('-');
  return toISO(Number(ys), Number(ms), daysInMonth(Number(ys), Number(ms)));
}

/** Mismo día del mes `delta` meses después; si no existe (31 en febrero), usa el último día. */
export function addMonthsClamped(date: ISODate, delta: number, anchorDay?: number): ISODate {
  const p = parseISO(date);
  if (!p) throw new Error(`Fecha inválida: ${date}`);
  const key = shiftMonth(`${pad(p.y, 4)}-${pad(p.m)}`, delta);
  const [ys, ms] = key.split('-');
  const day = Math.min(anchorDay ?? p.d, daysInMonth(Number(ys), Number(ms)));
  return toISO(Number(ys), Number(ms), day);
}

/** Fecha local del dispositivo en formato ISO. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function monthsRange(endKey: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(endKey, i - (count - 1)));
}
