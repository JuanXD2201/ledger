import { applyRecurring, generateDue, nextOccurrence, occurrences } from '../domain/recurrence';
import { accounts, categories } from '../domain/fixtures';
import type { LedgerData, Recurring } from '../domain/types';

const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  name: 'Arriendo',
  type: 'expense',
  amount: 900_000,
  accountId: 'a-bank',
  categoryId: 'c-food',
  frequency: 'monthly',
  startDate: '2025-01-31',
  tags: [],
  ...over,
});

describe('recurrencias', () => {
  it('mensual del 31 conserva el día ancla y baja al último día en meses cortos', () => {
    expect(occurrences(rule(), '2025-05-31')).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31']);
  });

  it('febrero bisiesto cae el 29', () => {
    expect(occurrences(rule({ startDate: '2024-01-31' }), '2024-03-01')).toEqual(['2024-01-31', '2024-02-29']);
  });

  it('semanal avanza de siete en siete', () => {
    expect(occurrences(rule({ frequency: 'weekly', startDate: '2025-03-03' }), '2025-03-24')).toEqual(['2025-03-03', '2025-03-10', '2025-03-17', '2025-03-24']);
  });

  it('no genera nada si empieza en el futuro', () => {
    expect(occurrences(rule({ startDate: '2025-09-01' }), '2025-08-31')).toEqual([]);
  });

  it('respeta la fecha de fin', () => {
    expect(occurrences(rule({ endDate: '2025-03-15' }), '2025-12-31')).toEqual(['2025-01-31', '2025-02-28']);
  });

  it('incluye la ocurrencia que cae exactamente hoy', () => {
    expect(occurrences(rule({ startDate: '2025-05-10' }), '2025-05-10')).toEqual(['2025-05-10']);
  });

  it('genera movimientos con id determinista y sin repetir los ya generados', () => {
    const first = generateDue(rule(), '2025-03-31');
    expect(first.transactions.map((t) => t.id)).toEqual(['rec-r1-2025-01-31', 'rec-r1-2025-02-28', 'rec-r1-2025-03-31']);
    const second = generateDue(rule({ generatedThrough: first.generatedThrough }), '2025-04-15');
    expect(second.transactions).toEqual([]);
    expect(second.generatedThrough).toBe('2025-03-31');
  });

  const base = (): LedgerData => ({ accounts, categories, transactions: [], recurring: [rule()], budgets: [] });

  it('applyRecurring es idempotente', () => {
    const once = applyRecurring(base(), '2025-04-30');
    expect(once.transactions).toHaveLength(4);
    const twice = applyRecurring(once, '2025-04-30');
    expect(twice).toBe(once);
  });

  it('applyRecurring solo agrega lo nuevo al avanzar el tiempo', () => {
    const once = applyRecurring(base(), '2025-02-28');
    const later = applyRecurring(once, '2025-03-31');
    expect(later.transactions.map((t) => t.date)).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
  });

  it('no vuelve a crear un movimiento que el usuario borró', () => {
    const once = applyRecurring(base(), '2025-03-31');
    const deleted = { ...once, transactions: once.transactions.filter((t) => t.date !== '2025-02-28') };
    expect(applyRecurring(deleted, '2025-03-31').transactions).toHaveLength(2);
  });

  it('calcula la próxima ocurrencia', () => {
    expect(nextOccurrence(rule(), '2025-02-10')).toBe('2025-02-28');
    expect(nextOccurrence(rule({ endDate: '2025-02-01' }), '2025-02-10')).toBeNull();
  });
});
