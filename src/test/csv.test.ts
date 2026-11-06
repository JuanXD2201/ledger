import { buildImportPlan, exportTransactionsCsv, materializeImport, parseCsv, parseFlexibleDate, toCsv } from '../domain/csv';
import { accounts, categories, tx } from '../domain/fixtures';

const ctx = (existing = [] as ReturnType<typeof tx>[]) => ({ accounts, categories, existing });
const HEAD = 'fecha,tipo,monto,cuenta,cuenta_destino,categoria,etiquetas,nota';

describe('parseCsv', () => {
  it('lee campos con comillas, comas y saltos de línea internos', () => {
    const { records } = parseCsv('a,b\r\n"x, y","línea 1\nlínea 2"\r\n"dice ""hola""",z');
    expect(records[1]!.cells).toEqual(['x, y', 'línea 1\nlínea 2']);
    expect(records[2]!.cells[0]).toBe('dice "hola"');
  });

  it('detecta punto y coma y quita el BOM', () => {
    const parsed = parseCsv('﻿fecha;monto\n2025-01-01;500');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.records[0]!.cells[0]).toBe('fecha');
  });

  it('informa comillas sin cerrar con la línea de origen', () => {
    expect(parseCsv('a,b\n1,"abierta\n2,3').error).toMatch(/línea 2/);
  });

  it('ignora líneas vacías pero conserva los números de línea', () => {
    const { records } = parseCsv('a,b\n\n1,2\n');
    expect(records.map((r) => r.line)).toEqual([1, 3]);
  });
});

describe('importación', () => {
  it('importa filas válidas de los tres tipos', () => {
    const plan = buildImportPlan(
      [HEAD, '2025-05-01,gasto,"45.000",Banco,,Mercado,hogar|semana,Compra', '2025-05-02,ingreso,3000000,Banco,,Salario,,Nómina', '2025-05-03,transferencia,100000,Banco,Efectivo,,,Retiro'].join('\n'),
      ctx(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows[0]!.tx.tags).toEqual(['hogar', 'semana']);
    expect(plan.rows[2]!.tx.toAccountId).toBe('a-cash');
  });

  it('acepta fechas DD/MM/AAAA y encabezados con tildes o mayúsculas', () => {
    const plan = buildImportPlan('Fecha,Tipo,Monto,Cuenta,Categoría\n05/06/2025,Gasto,10000,banco,mercado', ctx());
    expect(plan.rows[0]!.tx.date).toBe('2025-06-05');
  });

  it('reporta cada fila inválida con su línea y motivo, sin detener las demás', () => {
    const plan = buildImportPlan(
      [HEAD, '2025-02-30,gasto,1000,Banco,,Mercado,,x', '2025-05-01,gasto,-5,Banco,,Mercado,,y', '2025-05-01,regalo,5000,Banco,,Mercado,,z', '2025-05-01,gasto,5000,Fantasma,,Mercado,,w', '2025-05-01,gasto,7000,Banco,,Mercado,,ok'].join('\n'),
      ctx(),
    );
    expect(plan.rows).toHaveLength(1);
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(plan.errors[0]!.message).toMatch(/fecha inválida/);
    expect(plan.errors[1]!.message).toMatch(/monto inválido/);
    expect(plan.errors[2]!.message).toMatch(/tipo desconocido/);
    expect(plan.errors[3]!.message).toMatch(/no existe/);
  });

  it('falla de forma clara si faltan columnas obligatorias', () => {
    expect(buildImportPlan('fecha,monto\n2025-01-01,5', ctx()).fatal).toMatch(/tipo, cuenta/);
  });

  it('falla con archivo vacío, sin datos o con comillas rotas', () => {
    expect(buildImportPlan('', ctx()).fatal).toMatch(/vacío/);
    expect(buildImportPlan(HEAD, ctx()).fatal).toMatch(/ninguna fila/);
    expect(buildImportPlan(`${HEAD}\n2025-01-01,gasto,"5`, ctx()).fatal).toMatch(/comillas/);
  });

  it('rechaza transferencias a la misma cuenta o sin destino', () => {
    const plan = buildImportPlan([HEAD, '2025-05-01,transferencia,1000,Banco,Banco,,,a', '2025-05-01,transferencia,1000,Banco,,,,b'].join('\n'), ctx());
    expect(plan.rows).toHaveLength(0);
    expect(plan.errors).toHaveLength(2);
  });

  it('marca duplicados contra lo existente y dentro del archivo', () => {
    const existing = [tx({ date: '2025-05-01', amount: 45_000, accountId: 'a-bank', note: 'Compra' })];
    const plan = buildImportPlan([HEAD, '2025-05-01,gasto,45000,Banco,,Mercado,,compra', '2025-05-09,gasto,9000,Banco,,Mercado,,Pan', '2025-05-09,gasto,9000,Banco,,Mercado,,PAN'].join('\n'), ctx(existing));
    expect(plan.rows.map((r) => r.duplicate)).toEqual([true, false, true]);
  });

  it('propone categorías nuevas y valida que el tipo coincida', () => {
    const plan = buildImportPlan([HEAD, '2025-05-01,gasto,1000,Banco,,Mascotas,,a', '2025-05-02,gasto,2000,Banco,,Salario,,b'].join('\n'), ctx());
    expect(plan.newCategories).toEqual([{ name: 'Mascotas', kind: 'expense' }]);
    expect(plan.errors[0]!.message).toMatch(/no coincide con el tipo/);
  });

  it('materializa omitiendo duplicados salvo que se pidan', () => {
    const existing = [tx({ date: '2025-05-01', amount: 1000, accountId: 'a-bank', note: 'a' })];
    const plan = buildImportPlan([HEAD, '2025-05-01,gasto,1000,Banco,,Mascotas,,a', '2025-05-02,gasto,2000,Banco,,Mascotas,,b'].join('\n'), ctx(existing));
    let i = 0;
    const mk = (p: string) => `${p}-${(i += 1)}`;
    const skip = materializeImport(plan, { includeDuplicates: false }, mk, categories);
    expect(skip.transactions).toHaveLength(1);
    expect(skip.categories).toHaveLength(1);
    expect(skip.transactions[0]!.categoryId).toBe(skip.categories[0]!.id);
    expect(materializeImport(plan, { includeDuplicates: true }, mk, categories).transactions).toHaveLength(2);
  });

  it('interpreta fechas flexibles', () => {
    expect(parseFlexibleDate('1/2/2025')).toBe('2025-02-01');
    expect(parseFlexibleDate('31/04/2025')).toBeNull();
  });
});

describe('exportación', () => {
  it('escapa comas, comillas y neutraliza fórmulas', () => {
    expect(toCsv([['a,b', 'dice "x"', '=SUMA(A1)']])).toBe('"a,b","dice ""x""",\'=SUMA(A1)\r\n');
  });

  it('exporta con encabezados y puede reimportarse sin pérdida', () => {
    const txs = [tx({ date: '2025-05-01', amount: 45_000, tags: ['hogar'], note: 'Compra, grande' }), tx({ date: '2025-05-02', amount: 9_000, type: 'transfer', accountId: 'a-bank', toAccountId: 'a-cash', categoryId: undefined })];
    const csv = exportTransactionsCsv(txs, accounts, categories);
    expect(csv.split('\r\n')[0]).toBe(HEAD);
    const plan = buildImportPlan(csv, ctx());
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => r.tx.amount)).toEqual([45_000, 9_000]);
    expect(plan.rows[0]!.tx.note).toBe('Compra, grande');
  });
});
