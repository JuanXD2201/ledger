import type { ReactNode } from 'react';
import { formatCOP, formatMonth } from '../../domain/format';
import { shiftMonth } from '../../domain/dates';
import type { MonthKey } from '../../domain/types';
import { Icon, type IconName } from './Icon';

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p className="page-head__lead">{lead}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

/** Monto con signo y color según el tipo; cifras tabulares. */
export function Amount({ value, tone, signed = false }: { value: number; tone?: 'income' | 'expense' | 'neutral'; signed?: boolean }) {
  const sign = signed ? (tone === 'income' ? '+' : tone === 'expense' ? '−' : '') : '';
  const shown = tone && tone !== 'neutral' ? Math.abs(value) : value;
  return <span className={`num${tone ? ` num--${tone}` : ''}`}>{sign}{formatCOP(shown)}</span>;
}

export function EmptyState({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={26} /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="row row--center">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ month, onChange, max }: { month: MonthKey; onChange: (m: MonthKey) => void; max: MonthKey }) {
  return (
    <div className="month-picker" role="group" aria-label="Mes">
      <button type="button" className="icon-btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mes anterior">
        <Icon name="left" />
      </button>
      <span className="month-picker__label" aria-live="polite">{formatMonth(month)}</span>
      <button type="button" className="icon-btn" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mes siguiente" disabled={month >= max}>
        <Icon name="right" />
      </button>
    </div>
  );
}

export function ProgressBar({ ratio, level, label }: { ratio: number; level: 'ok' | 'warning' | 'exceeded'; label: string }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  return (
    <div className={`progress progress--${level}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      <div className="progress__fill" style={{ width: `${pct}%` }} />
      <span className="progress__tick" aria-hidden="true" />
    </div>
  );
}

export function LevelBadge({ level, ratio }: { level: 'ok' | 'warning' | 'exceeded'; ratio: number }) {
  if (level === 'ok') return null;
  return (
    <span className={`badge badge--${level}`}>
      <Icon name="alert" size={14} />
      {level === 'warning' ? 'Cerca del límite' : ratio > 1 ? 'Presupuesto superado' : 'Límite alcanzado'}
    </span>
  );
}
