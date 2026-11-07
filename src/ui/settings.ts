import { useCallback, useState } from 'react';

/** Ajustes personales que no forman parte del libro: viven en su propia clave de localStorage. */
const KEY = 'ledger.ajustes';
const THEME_KEY = 'ledger.tema';

export interface Settings {
  /** Nombre del titular del libro; se muestra en el panel y en los informes impresos. */
  holder: string;
}

const defaults: Settings = { holder: '' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Settings).holder === 'string') {
      return { holder: (parsed as Settings).holder.slice(0, 60) };
    }
  } catch {
    /* ajustes ilegibles: se usan los valores por defecto */
  }
  return defaults;
}

export function saveSettings(next: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ holder: next.holder.trim().slice(0, 60) }));
  } catch {
    /* sin almacenamiento: el ajuste vale solo en esta sesión */
  }
}

/** Borra los ajustes y la preferencia de tema (parte de «borrar todos los datos»). */
export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(THEME_KEY);
  } catch {
    /* nada que borrar */
  }
}

export function useSettings(): [Settings, (next: Settings) => void] {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings({ holder: next.holder.trim().slice(0, 60) });
  }, []);
  return [settings, update];
}

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
