import { createBackup, parseBackup, readEnvelope, SCHEMA_VERSION, validateData } from '../domain/schema';
import { buildSampleData } from '../domain/seed';
import { starterData } from '../domain/seed';
import { LocalStorageRepository, MemoryStore, STORAGE_KEY } from '../storage/repository';

const v1 = () => ({
  schemaVersion: 1,
  data: {
    accounts: [{ id: 'a1', name: 'Banco', type: 'bank', openingBalance: 1000 }],
    categories: [{ id: 'c1', name: 'Mercado', kind: 'expense' }],
    transactions: [{ id: 't1', date: '2025-01-05', type: 'expense', amount: 500, accountId: 'a1', categoryId: 'c1' }],
  },
});

describe('migración de esquema', () => {
  it('migra v1 a v2 agregando etiquetas, color, recurrentes y presupuestos', () => {
    const res = readEnvelope(v1());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.migratedFrom).toBe(1);
    expect(res.data.transactions[0]!.tags).toEqual([]);
    expect(res.data.categories[0]!.color).toBeTruthy();
    expect(res.data.recurring).toEqual([]);
    expect(res.data.budgets).toEqual([]);
  });

  it('rechaza versiones futuras con un mensaje claro', () => {
    const res = readEnvelope({ schemaVersion: SCHEMA_VERSION + 1, data: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/más nuevo/);
  });

  it('rechaza sobres sin versión', () => {
    expect(readEnvelope({ data: {} }).ok).toBe(false);
  });
});

describe('validación de datos', () => {
  it('acepta los datos de ejemplo completos', () => {
    const res = validateData(buildSampleData('2025-06-15'));
    expect(res.ok).toBe(true);
  });

  it('detecta referencias rotas', () => {
    const data = starterData();
    const bad = { ...data, transactions: [{ id: 'x', date: '2025-01-01', type: 'expense', amount: 5, accountId: 'nada', categoryId: 'cat-mercado', tags: [], note: '' }] };
    const res = validateData(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/cuenta no existe/);
  });

  it('detecta identificadores repetidos y montos no positivos', () => {
    const data = starterData();
    const t = { id: 'x', date: '2025-01-01', type: 'expense', amount: 5, accountId: 'acc-efectivo', categoryId: 'cat-mercado', tags: [], note: '' };
    expect(validateData({ ...data, transactions: [t, t] }).ok).toBe(false);
    expect(validateData({ ...data, transactions: [{ ...t, amount: 0 }] }).ok).toBe(false);
  });
});

describe('respaldo JSON', () => {
  it('ida y vuelta sin pérdida', () => {
    const data = buildSampleData('2025-06-15');
    const res = parseBackup(JSON.stringify(createBackup(data)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(data);
  });

  it('rechaza JSON roto, archivos ajenos y datos corruptos', () => {
    expect(parseBackup('{no es json').ok).toBe(false);
    expect(parseBackup('{"hola":1}').ok).toBe(false);
    const backup = createBackup(starterData());
    const corrupt = JSON.stringify({ ...backup, data: { ...(backup.data as object), accounts: 'x' } });
    expect(parseBackup(corrupt).ok).toBe(false);
  });
});

describe('repositorio localStorage', () => {
  it('devuelve vacío cuando no hay nada guardado', async () => {
    expect((await new LocalStorageRepository(new MemoryStore()).load()).status).toBe('empty');
  });

  it('guarda y recupera', async () => {
    const repo = new LocalStorageRepository(new MemoryStore());
    const data = buildSampleData('2025-06-15');
    await repo.save(data);
    const res = await repo.load();
    expect(res.status === 'ok' && res.data).toEqual(data);
  });

  it('migra datos v1 al cargar y los reescribe en la versión actual', async () => {
    const store = new MemoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(v1()));
    const res = await new LocalStorageRepository(store).load();
    expect(res.status).toBe('ok');
    expect(JSON.parse(store.getItem(STORAGE_KEY)!).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('informa error cuando los datos están corruptos, sin borrarlos', async () => {
    const store = new MemoryStore();
    store.setItem(STORAGE_KEY, '{{corrupto');
    const res = await new LocalStorageRepository(store).load();
    expect(res.status).toBe('error');
    expect(store.getItem(STORAGE_KEY)).toBe('{{corrupto');
  });

  it('convierte los fallos de escritura en un error legible', async () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => undefined };
    await expect(new LocalStorageRepository(full).save(starterData())).rejects.toThrow(/No se pudo guardar/);
  });
});
