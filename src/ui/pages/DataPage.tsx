import { useRef, useState, type ChangeEvent } from 'react';
import { buildImportPlan, CSV_HEADERS, exportTransactionsCsv, materializeImport, toCsv, type ImportPlan } from '../../domain/csv';
import { formatDate } from '../../domain/format';
import { makeId } from '../../domain/ids';
import { createBackup, parseBackup } from '../../domain/schema';
import type { LedgerData } from '../../domain/types';
import { Amount, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { downloadText, MAX_FILE_BYTES, readFileText } from '../download';
import { useLedger } from '../store';
import { useToast } from '../toast';

const TEMPLATE = toCsv([
  CSV_HEADERS,
  ['2026-01-05', 'gasto', '85000', 'Cuenta de ahorros', '', 'Mercado', 'hogar', 'Compra semanal'],
  ['2026-01-06', 'ingreso', '3500000', 'Cuenta de ahorros', '', 'Salario', 'nómina', 'Pago quincenal'],
  ['2026-01-07', 'transferencia', '200000', 'Cuenta de ahorros', 'Efectivo', '', '', 'Retiro'],
]);

type Confirm = { kind: 'demo' } | { kind: 'empty' } | { kind: 'restore'; data: LedgerData; counts: string } | null;

export function DataPage() {
  const ledger = useLedger();
  const { data, today } = ledger;
  const toast = useToast();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState('');
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [restoreErrors, setRestoreErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const onCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setIncludeDuplicates(false);
    if (file.size > MAX_FILE_BYTES) {
      setPlan({ fatal: 'El archivo pesa más de 3 MB. Divídelo en partes más pequeñas.', rows: [], errors: [], newCategories: [], totalRows: 0 });
      return;
    }
    setBusy(true);
    try {
      const text = await readFileText(file);
      setPlan(buildImportPlan(text, { accounts: data.accounts, categories: data.categories, existing: data.transactions }));
    } catch (err) {
      setPlan({ fatal: err instanceof Error ? err.message : 'No se pudo leer el archivo.', rows: [], errors: [], newCategories: [], totalRows: 0 });
    } finally {
      setBusy(false);
    }
  };

  const importable = plan ? plan.rows.filter((r) => includeDuplicates || !r.duplicate).length : 0;
  const duplicates = plan ? plan.rows.filter((r) => r.duplicate).length : 0;

  const confirmImport = () => {
    if (!plan) return;
    const { transactions, categories } = materializeImport(plan, { includeDuplicates }, makeId, data.categories);
    ledger.importData(transactions, categories);
    toast({ message: `Se importaron ${transactions.length} movimientos${categories.length ? ` y ${categories.length} categorías nuevas` : ''}.` });
    setPlan(null);
    setFileName('');
  };

  const errorReport = () => {
    if (!plan) return;
    downloadText('ledger-errores-importacion.csv', toCsv([['linea', 'motivo'], ...plan.errors.map((e) => [String(e.line), e.message])]), 'text/csv', true);
  };

  const onJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoreErrors([]);
    if (file.size > 10 * 1024 * 1024) return setRestoreErrors(['El archivo pesa más de 10 MB.']);
    try {
      const result = parseBackup(await readFileText(file));
      if (!result.ok) return setRestoreErrors(result.errors);
      const d = result.data;
      setConfirm({ kind: 'restore', data: d, counts: `${d.transactions.length} movimientos, ${d.accounts.length} cuentas, ${d.budgets.length} presupuestos` });
    } catch (err) {
      setRestoreErrors([err instanceof Error ? err.message : 'No se pudo leer el archivo.']);
    }
  };

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'demo') {
      ledger.loadDemo();
      toast({ message: 'Datos de ejemplo cargados.' });
    } else if (confirm.kind === 'empty') {
      ledger.startEmpty();
      toast({ message: 'Libro vacío listo. Agrega tu primer movimiento.' });
    } else {
      ledger.replaceAll(confirm.data);
      toast({ message: 'Respaldo restaurado.' });
    }
    setConfirm(null);
    setPlan(null);
  };

  return (
    <>
      <PageHeader title="Importar y respaldo" lead="Trae tus movimientos desde un CSV, llévate una copia o restaura una anterior. Todo ocurre en tu navegador." />

      <section className="panel" aria-labelledby="h-import">
        <h2 id="h-import" className="h-serif">Importar desde CSV</h2>
        <p className="muted">Columnas: <code>fecha, tipo, monto, cuenta</code> (obligatorias), <code>cuenta_destino, categoria, etiquetas, nota</code>. Las cuentas deben existir; las categorías nuevas se crean.</p>
        <div className="row">
          <input ref={csvInput} id="archivo-csv" data-testid="archivo-csv" className="sr-only" type="file" accept=".csv,text/csv" onChange={onCsv} />
          <button type="button" className="btn" onClick={() => csvInput.current?.click()} disabled={busy}><Icon name="upload" size={18} /> Elegir archivo CSV</button>
          <button type="button" className="btn btn--ghost" onClick={() => downloadText('ledger-plantilla.csv', TEMPLATE, 'text/csv', true)}><Icon name="file" size={18} /> Descargar plantilla</button>
          {fileName && <span className="muted small">{fileName}</span>}
        </div>

        {busy && <p className="muted" role="status">Leyendo el archivo…</p>}

        {plan?.fatal && (
          <div className="banner banner--alert" role="alert"><Icon name="alert" size={20} /><p>{plan.fatal}</p></div>
        )}

        {plan && !plan.fatal && (
          <div className="import-result" data-testid="vista-previa">
            <ul className="stats">
              <li><strong>{plan.totalRows}</strong> filas leídas</li>
              <li><strong>{plan.rows.length - duplicates}</strong> nuevas</li>
              <li className={duplicates ? 'is-warn' : ''}><strong>{duplicates}</strong> posibles duplicados</li>
              <li className={plan.errors.length ? 'is-bad' : ''}><strong>{plan.errors.length}</strong> con errores</li>
            </ul>
            {plan.newCategories.length > 0 && <p className="muted">Se crearán estas categorías: {plan.newCategories.map((c) => c.name).join(', ')}.</p>}

            {plan.rows.length > 0 && (
              <table className="tx-table preview">
                <caption className="sr-only">Vista previa de las primeras filas válidas</caption>
                <thead><tr><th scope="col">Línea</th><th scope="col">Fecha</th><th scope="col">Detalle</th><th scope="col" className="num-col">Monto</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {plan.rows.slice(0, 8).map((r) => (
                    <tr key={r.line}>
                      <td className="num">{r.line}</td>
                      <td>{formatDate(r.tx.date)}</td>
                      <td>{r.tx.note || (r.tx.type === 'transfer' ? 'Transferencia' : (r.newCategory?.name ?? data.categories.find((c) => c.id === r.tx.categoryId)?.name ?? ''))}</td>
                      <td className="num-col"><Amount value={r.tx.amount} tone={r.tx.type === 'income' ? 'income' : r.tx.type === 'expense' ? 'expense' : 'neutral'} signed /></td>
                      <td>{r.duplicate ? <span className="badge badge--warning">Duplicado</span> : <span className="badge badge--ok">Nuevo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {plan.rows.length > 8 && <p className="muted small">Mostrando 8 de {plan.rows.length} filas válidas.</p>}

            {plan.errors.length > 0 && (
              <div className="errors" role="region" aria-label="Filas con errores">
                <div className="panel__head">
                  <h3>Filas con errores (no se importarán)</h3>
                  <button type="button" className="link-btn" onClick={errorReport}>Descargar reporte</button>
                </div>
                <ul>
                  {plan.errors.slice(0, 50).map((e) => <li key={e.line}><strong>Línea {e.line}:</strong> {e.message}</li>)}
                </ul>
                {plan.errors.length > 50 && <p className="muted small">…y {plan.errors.length - 50} más en el reporte descargable.</p>}
              </div>
            )}

            <div className="import-actions">
              {duplicates > 0 && (
                <label className="check"><input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} /> Importar también los duplicados</label>
              )}
              <span className="spacer" />
              <button type="button" className="btn btn--ghost" onClick={() => { setPlan(null); setFileName(''); }}>Descartar</button>
              <button type="button" className="btn" disabled={importable === 0} onClick={confirmImport}>Importar {importable} {importable === 1 ? 'movimiento' : 'movimientos'}</button>
            </div>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="h-export">
          <h2 id="h-export" className="h-serif">Exportar a CSV</h2>
          <p className="muted">Descarga los {data.transactions.length} movimientos en un archivo que abre Excel o Google Sheets, y que Ledger puede volver a importar.</p>
          <button type="button" className="btn" disabled={data.transactions.length === 0} onClick={() => { downloadText(`ledger-movimientos-${today}.csv`, exportTransactionsCsv(data.transactions, data.accounts, data.categories), 'text/csv', true); toast({ message: 'CSV exportado.' }); }}>
            <Icon name="download" size={18} /> Exportar movimientos
          </button>
        </section>

        <section className="panel" aria-labelledby="h-backup">
          <h2 id="h-backup" className="h-serif">Respaldo completo</h2>
          <p className="muted">Un archivo JSON con cuentas, categorías, movimientos, recurrentes y presupuestos. Se valida al restaurarlo.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => { downloadText(`ledger-respaldo-${today}.json`, JSON.stringify(createBackup(data), null, 2), 'application/json'); toast({ message: 'Respaldo descargado.' }); }}>
              <Icon name="download" size={18} /> Descargar respaldo
            </button>
            <input ref={jsonInput} data-testid="archivo-json" className="sr-only" type="file" accept=".json,application/json" onChange={onJson} />
            <button type="button" className="btn btn--ghost" onClick={() => jsonInput.current?.click()}><Icon name="upload" size={18} /> Restaurar</button>
          </div>
          {restoreErrors.length > 0 && (
            <div className="banner banner--alert" role="alert">
              <Icon name="alert" size={20} />
              <div><p><strong>No se pudo restaurar el respaldo.</strong></p><ul>{restoreErrors.map((e) => <li key={e}>{e}</li>)}</ul></div>
            </div>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="h-demo">
        <h2 id="h-demo" className="h-serif">Datos de ejemplo</h2>
        <p className="muted">Reemplaza el contenido actual. Si quieres conservarlo, descarga antes un respaldo.</p>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm({ kind: 'demo' })}>Cargar datos de ejemplo</button>
          <button type="button" className="btn btn--danger-ghost" onClick={() => setConfirm({ kind: 'empty' })}>Empezar vacío</button>
        </div>
        {!ledger.persistent && <p className="banner banner--alert" role="status">Tu navegador bloquea el almacenamiento local: los cambios se perderán al cerrar la pestaña.</p>}
        {ledger.saveError && <p className="banner banner--alert" role="alert">{ledger.saveError}</p>}
      </section>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.kind === 'restore' ? 'Restaurar respaldo' : confirm?.kind === 'demo' ? 'Cargar datos de ejemplo' : 'Empezar vacío'}>
        <div className="form">
          <p>
            {confirm?.kind === 'restore' && `Este respaldo contiene ${confirm.counts}. Reemplazará todo lo que tienes ahora (${data.transactions.length} movimientos).`}
            {confirm?.kind === 'demo' && 'Se reemplazarán tus datos actuales por un libro de ejemplo con seis meses de movimientos.'}
            {confirm?.kind === 'empty' && 'Se borrarán tus movimientos, presupuestos y recurrentes. Quedará una cuenta de efectivo y las categorías básicas.'}
          </p>
          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>Cancelar</button>
            <button type="button" className={`btn${confirm?.kind === 'empty' ? ' btn--danger' : ''}`} onClick={runConfirm}>
              {confirm?.kind === 'restore' ? 'Restaurar' : confirm?.kind === 'demo' ? 'Cargar ejemplo' : 'Sí, empezar vacío'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
