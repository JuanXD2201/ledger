import { parseISO } from './dates';
import type { ISODate, MonthKey } from './types';

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const copCompact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export const formatCOP = (value: number): string => cop.format(Math.round(value)).replace(/ /g, ' ');
export const formatCompact = (value: number): string => copCompact.format(value);
export const formatNumber = (value: number): string => plain.format(Math.round(value));

const dateFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLong = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dateDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });

function utc(date: ISODate): Date {
  const p = parseISO(date);
  if (!p) return new Date(NaN);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

export const formatDate = (date: ISODate): string => (parseISO(date) ? dateFmt.format(utc(date)) : date);
export const formatDateLong = (date: ISODate): string => (parseISO(date) ? dateLong.format(utc(date)) : date);
export const formatDateFull = (date: ISODate): string => (parseISO(date) ? dateDay.format(utc(date)) : date);
export const formatMonth = (key: MonthKey): string => monthFmt.format(utc(`${key}-01`));
export const formatMonthShort = (key: MonthKey): string => monthShort.format(utc(`${key}-01`)).replace('.', '');

export const formatPercent = (ratio: number): string => `${Math.round(ratio * 100)} %`;
