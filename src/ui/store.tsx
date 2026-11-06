import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayISO } from '../domain/dates';
import { makeId } from '../domain/ids';
import { applyRecurring } from '../domain/recurrence';
import { buildDemoData, starterData } from '../domain/seed';
import type { Account, Category, ISODate, LedgerData, Recurring, Transaction } from '../domain/types';
import { createBrowserStore, LocalStorageRepository, type LedgerRepository } from '../storage/repository';

type Phase = { name: 'loading' } | { name: 'error'; errors: string[]; raw: string } | { name: 'ready' };

export interface LedgerApi {
  data: LedgerData;
  today: ISODate;
  /** false si el navegador no permite guardar (modo privado estricto). */
  persistent: boolean;
  saveError: string | null;
  addTransaction(tx: Omit<Transaction, 'id'>): Transaction;
  updateTransaction(tx: Transaction): void;
  removeTransaction(id: string): Transaction | undefined;
  restoreTransaction(tx: Transaction): void;
  importData(txs: Transaction[], categories: Category[]): void;
  saveAccount(account: Account): void;
  /** Devuelve un mensaje si no se puede eliminar. */
  removeAccount(id: string): string | null;
  saveRecurring(rule: Recurring): void;
  removeRecurring(id: string): void;
  setBudget(categoryId: string, limit: number | null): void;
  replaceAll(data: LedgerData): void;
  loadDemo(): void;
  startEmpty(): void;
}

const Ctx = createContext<LedgerApi | null>(null);

export function useLedger(): LedgerApi {
  const value = useContext(Ctx);
  if (!value) throw new Error('useLedger debe usarse dentro de LedgerProvider');
  return value;
}

export function LedgerProvider({ children, repository }: { children: ReactNode; repository?: LedgerRepository }) {
  const { repo, persistent } = useMemo(() => {
    if (repository) return { repo: repository, persistent: true };
    const { store, persistent } = createBrowserStore();
    return { repo: new LocalStorageRepository(store), persistent };
  }, [repository]);
  const today = useMemo(() => todayISO(), []);
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [data, setData] = useState<LedgerData>(starterData);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void repo.load().then((res) => {
      if (cancelled) return;
      if (res.status === 'error') return setPhase({ name: 'error', errors: res.errors, raw: res.raw });
      setData(applyRecurring(res.status === 'ok' ? res.data : buildDemoData(today), today));
      loaded.current = true;
      setPhase({ name: 'ready' });
    });
    return () => {
      cancelled = true;
    };
  }, [repo, today]);

  useEffect(() => {
    if (!loaded.current) return;
    repo.save(data).then(
      () => setSaveError(null),
      (e: unknown) => setSaveError(e instanceof Error ? e.message : 'No se pudo guardar.'),
    );
  }, [data, repo]);

  const api = useMemo<LedgerApi>(
    () => ({
      data,
      today,
      persistent,
      saveError,
      addTransaction(tx) {
        const full: Transaction = { ...tx, id: makeId('tx') };
        setData((d) => ({ ...d, transactions: [...d.transactions, full] }));
        return full;
      },
      updateTransaction(tx) {
        setData((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === tx.id ? tx : t)) }));
      },
      removeTransaction(id) {
        const found = data.transactions.find((t) => t.id === id);
        if (found) setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
        return found;
      },
      restoreTransaction(tx) {
        setData((d) => (d.transactions.some((t) => t.id === tx.id) ? d : { ...d, transactions: [...d.transactions, tx] }));
      },
      importData(txs, categories) {
        setData((d) => ({ ...d, categories: [...d.categories, ...categories], transactions: [...d.transactions, ...txs] }));
      },
      saveAccount(account) {
        setData((d) => ({
          ...d,
          accounts: d.accounts.some((a) => a.id === account.id) ? d.accounts.map((a) => (a.id === account.id ? account : a)) : [...d.accounts, account],
        }));
      },
      removeAccount(id) {
        const used = data.transactions.some((t) => t.accountId === id || t.toAccountId === id) || data.recurring.some((r) => r.accountId === id);
        if (used) return 'Esta cuenta tiene movimientos. Elimina o mueve sus movimientos antes de borrarla.';
        setData((d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== id) }));
        return null;
      },
      saveRecurring(rule) {
        setData((d) =>
          applyRecurring(
            { ...d, recurring: d.recurring.some((r) => r.id === rule.id) ? d.recurring.map((r) => (r.id === rule.id ? rule : r)) : [...d.recurring, rule] },
            today,
          ),
        );
      },
      removeRecurring(id) {
        setData((d) => ({ ...d, recurring: d.recurring.filter((r) => r.id !== id) }));
      },
      setBudget(categoryId, limit) {
        setData((d) => {
          const rest = d.budgets.filter((b) => b.categoryId !== categoryId);
          return { ...d, budgets: limit === null ? rest : [...rest, { categoryId, limit }] };
        });
      },
      replaceAll(next) {
        setData(applyRecurring(next, today));
      },
      loadDemo() {
        setData(applyRecurring(buildDemoData(today), today));
      },
      startEmpty() {
        setData(starterData());
      },
    }),
    [data, today, persistent, saveError],
  );

  if (phase.name === 'loading') {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="boot__mark" aria-hidden="true" />
        <p>Abriendo tu libro…</p>
      </div>
    );
  }
  if (phase.name === 'error') {
    return <StorageError errors={phase.errors} raw={phase.raw} onReset={async () => { await repo.clear(); location.reload(); }} />;
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function StorageError({ errors, raw, onReset }: { errors: string[]; raw: string; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledger-datos-originales.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="boot boot--error" role="alert">
      <h1>No pudimos leer tus datos guardados</h1>
      <p>Por seguridad no los modificamos. Puedes descargar una copia tal como está y luego reiniciar con datos de ejemplo.</p>
      <ul>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" type="button" onClick={download}>Descargar copia original</button>
        {confirming ? (
          <button className="btn btn--danger" type="button" onClick={onReset}>Sí, reiniciar ahora</button>
        ) : (
          <button className="btn btn--ghost" type="button" onClick={() => setConfirming(true)}>Reiniciar con datos de ejemplo</button>
        )}
      </div>
    </main>
  );
}
