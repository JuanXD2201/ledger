import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CategoryShare, MonthFlow, TrendPoint } from '../../domain/aggregates';
import { formatCOP, formatCompact, formatDateFull, formatMonthShort, formatPercent } from '../../domain/format';

/** Ancho real del contenedor, para dibujar el SVG a tamaño natural (textos legibles en móvil). */
function useWidth<T extends HTMLElement>(fallback = 520): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* ---------------- Dona ---------------- */

export function Donut({ slices, total }: { slices: CategoryShare[]; total: number }) {
  const size = 220;
  const r = 82;
  const stroke = 30;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const label = `Gasto por categoría. Total ${formatCOP(total)}. ${slices.map((s) => `${s.name} ${formatPercent(s.share)}`).join(', ')}.`;
  return (
    <svg className="donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {slices.map((s) => {
          const len = Math.max(0, s.share * c - (slices.length > 1 ? 2.5 : 0));
          const node = (
            <circle key={s.categoryId} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}>
              <title>{`${s.name}: ${formatCOP(s.total)} (${formatPercent(s.share)})`}</title>
            </circle>
          );
          offset += s.share * c;
          return node;
        })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" className="donut__caption">Gastado</text>
      <text x="50%" y="58%" textAnchor="middle" className="donut__total">{formatCompact(total)}</text>
    </svg>
  );
}

/* ---------------- Barras ingresos / gastos ---------------- */

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(value));
  const n = value / mag;
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10) * mag;
}

export function FlowBars({ flow }: { flow: MonthFlow[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 250;
  const pad = { l: 46, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(...flow.flatMap((f) => [f.income, f.expense]), 1));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const group = innerW / flow.length;
  const barW = Math.min(26, group * 0.3);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const label = `Ingresos y gastos por mes. ${flow.map((f) => `${formatMonthShort(f.month)}: ingresos ${formatCOP(f.income)}, gastos ${formatCOP(f.expense)}`).join('. ')}.`;
  return (
    <div ref={ref} className="chart">
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tick">{formatCompact(t)}</text>
          </g>
        ))}
        {flow.map((f, i) => {
          const cx = pad.l + group * i + group / 2;
          return (
            <g key={f.month}>
              <rect x={cx - barW - 2} y={y(f.income)} width={barW} height={Math.max(0, y(0) - y(f.income))} rx="2" className="bar bar--income">
                <title>{`${formatMonthShort(f.month)} · ingresos ${formatCOP(f.income)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(f.expense)} width={barW} height={Math.max(0, y(0) - y(f.expense))} rx="2" className="bar bar--expense">
                <title>{`${formatMonthShort(f.month)} · gastos ${formatCOP(f.expense)}`}</title>
              </rect>
              <text x={cx} y={height - 8} textAnchor="middle" className="tick">{formatMonthShort(f.month)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- Tendencia de saldo ---------------- */

export function TrendLine({ points, height = 220, compact = false }: { points: TrendPoint[]; height?: number; compact?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = compact ? { l: 4, r: 4, t: 10, b: 6 } : { l: 52, r: 10, t: 14, b: 26 };
  if (points.length < 2) return null;
  const values = points.map((p) => p.balance);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const min = lo - span * 0.1;
  const maxV = hi + span * 0.1;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - ((v - min) / (maxV - min)) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${pad.t + innerH} L${x(0).toFixed(1)},${pad.t + innerH} Z`;
  const ticks = [0, 1, 2, 3].map((i) => min + ((maxV - min) * i) / 3);
  const labelIdx = [0, Math.floor(points.length / 3), Math.floor((2 * points.length) / 3), points.length - 1];
  const a = active !== null ? points[active] : undefined;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - pad.l) / innerW;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? points.length - 1) - 1));
    else if (e.key === 'ArrowRight') setActive((i) => Math.min(points.length - 1, (i ?? points.length - 1) + 1));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className="chart chart--trend">
      <svg
        width={width}
        height={height}
        role="img"
        tabIndex={compact ? -1 : 0}
        aria-label={`Tendencia del patrimonio del ${formatDateFull(first.date)} al ${formatDateFull(last.date)}: de ${formatCOP(first.balance)} a ${formatCOP(last.balance)}. Usa las flechas para recorrer los días.`}
        onPointerMove={compact ? undefined : onMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={compact ? undefined : onKey}
        onBlur={() => setActive(null)}
      >
        <defs>
          <linearGradient id={compact ? 'tg-c' : 'tg'} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--forest-line)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--forest-line)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!compact &&
          ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tick">{formatCompact(t)}</text>
            </g>
          ))}
        <path d={area} fill={`url(#${compact ? 'tg-c' : 'tg'})`} />
        <path d={line} className="trend-line" />
        {!compact &&
          labelIdx.map((i) => (
            <text key={i} x={Math.min(Math.max(x(i), pad.l + 16), width - pad.r - 22)} y={height - 6} textAnchor="middle" className="tick">
              {points[i]!.date.slice(8)} {formatMonthShort(points[i]!.date.slice(0, 7))}
            </text>
          ))}
        {a && active !== null && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + innerH} className="cross" />
            <circle cx={x(active)} cy={y(a.balance)} r="4.5" className="trend-dot" />
          </g>
        )}
      </svg>
      {a && (
        <div className="chart__tip" role="status" style={{ left: Math.min(Math.max(x(active!), 80), width - 80) }}>
          <strong>{formatCOP(a.balance)}</strong>
          <span>{formatDateFull(a.date)}</span>
        </div>
      )}
    </div>
  );
}
