import { readEnvelope, toEnvelope } from '../domain/schema';
import type { LedgerData } from '../domain/types';

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; data: LedgerData; migratedFrom?: number }
  | { status: 'error'; errors: string[]; raw: string };

/** Contrato de persistencia: la UI no sabe si detrás hay localStorage, IndexedDB o memoria. */
export interface LedgerRepository {
  load(): Promise<LoadResult>;
  save(data: LedgerData): Promise<void>;
  clear(): Promise<void>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'ledger.datos';

/** Persistencia en localStorage con esquema versionado; migra al leer si hace falta. */
export class LocalStorageRepository implements LedgerRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = STORAGE_KEY,
  ) {}

  async load(): Promise<LoadResult> {
    const raw = this.store.getItem(this.key);
    if (raw === null) return { status: 'empty' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'error', errors: ['Los datos guardados no son un JSON legible.'], raw };
    }
    const result = readEnvelope(parsed);
    if (!result.ok) return { status: 'error', errors: result.errors, raw };
    if (result.migratedFrom !== undefined) await this.save(result.data); // guarda ya migrado
    return { status: 'ok', data: result.data, ...(result.migratedFrom !== undefined ? { migratedFrom: result.migratedFrom } : {}) };
  }

  async save(data: LedgerData): Promise<void> {
    try {
      this.store.setItem(this.key, JSON.stringify(toEnvelope(data)));
    } catch {
      throw new Error('No se pudo guardar: el navegador bloqueó el almacenamiento o está lleno.');
    }
  }

  async clear(): Promise<void> {
    this.store.removeItem(this.key);
  }
}

/** Almacén en memoria con la forma de Storage; sirve para pruebas y como respaldo si el navegador lo bloquea. */
export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Elige localStorage si responde; si no (modo privado estricto), usa memoria. */
export function createBrowserStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const probe = '__ledger_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { store: window.localStorage, persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}
