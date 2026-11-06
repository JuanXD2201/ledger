import { addDays, addMonthsClamped, daysInMonth, diffDays, isValidISO, monthEnd, monthsRange, shiftMonth, todayISO } from '../domain/dates';
import { formatCOP, formatDate, formatMonth } from '../domain/format';
import { parseAmount } from '../domain/money';

describe('fechas', () => {
  it('detecta años bisiestos en febrero', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
  });

  it('rechaza fechas inexistentes', () => {
    expect(isValidISO('2025-02-29')).toBe(false);
    expect(isValidISO('2024-02-29')).toBe(true);
    expect(isValidISO('2025-13-01')).toBe(false);
    expect(isValidISO('2025-1-1')).toBe(false);
  });

  it('suma días cruzando fin de mes y de año', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('calcula diferencias de días', () => {
    expect(diffDays('2025-03-01', '2025-02-01')).toBe(28);
  });

  it('ajusta el día al último del mes al sumar meses', () => {
    expect(addMonthsClamped('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2025-01-31', 2, 31)).toBe('2025-03-31');
    expect(addMonthsClamped('2025-11-30', 3)).toBe('2026-02-28');
  });

  it('desplaza meses hacia atrás y adelante', () => {
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(shiftMonth('2025-11', 3)).toBe('2026-02');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthsRange('2025-02', 3)).toEqual(['2024-12', '2025-01', '2025-02']);
  });

  it('usa la fecha local para «hoy»', () => {
    expect(todayISO(new Date(2025, 5, 9, 23, 59))).toBe('2025-06-09');
  });
});

describe('montos', () => {
  it.each([
    ['85000', 85000],
    ['85.000', 85000],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    ['$ 2.500.000', 2500000],
    ['1234,50', 1235],
    ['1.234.567,50', 1234568],
  ])('interpreta «%s»', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(['', 'abc', '-500', '0', '12,3456,7', '1e9', '12.34.5'])('rechaza «%s»', (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });

  it('rechaza montos absurdamente grandes', () => {
    expect(parseAmount('99999999999999999')).toBeNull();
  });
});

describe('formato es-CO', () => {
  it('formatea pesos sin decimales', () => {
    expect(formatCOP(1234567)).toMatch(/1\.234\.567/);
    expect(formatCOP(1234567)).toContain('$');
  });

  it('formatea fechas y meses en español', () => {
    expect(formatDate('2025-03-05')).toMatch(/mar/i);
    expect(formatMonth('2025-03')).toMatch(/marzo/i);
  });
});
