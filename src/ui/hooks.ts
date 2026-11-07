import { useCallback, useEffect, useState } from 'react';

export const ROUTES = [
  { path: 'panel', label: 'Panel', short: 'Panel', key: 'p' },
  { path: 'movimientos', label: 'Movimientos', short: 'Movs.', key: 'm' },
  { path: 'presupuestos', label: 'Presupuestos', short: 'Presup.', key: 'b' },
  { path: 'informes', label: 'Informes', short: 'Informes', key: 'i' },
  { path: 'cuentas', label: 'Cuentas', short: 'Cuentas', key: 'c' },
  { path: 'datos', label: 'Importar y respaldo', short: 'Datos', key: 'd' },
  { path: 'ajustes', label: 'Ajustes', short: 'Ajustes', key: 'a' },
] as const;

export type RoutePath = (typeof ROUTES)[number]['path'];

const parse = (): RoutePath => {
  const raw = window.location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return (ROUTES.find((r) => r.path === raw)?.path ?? 'panel') as RoutePath;
};

/** Navegación por hash: no necesita servidor y funciona desde cualquier subruta. */
export function useRoute(): [RoutePath, (r: RoutePath) => void] {
  const [route, setRoute] = useState<RoutePath>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((r: RoutePath) => {
    window.location.hash = `#/${r}`;
  }, []);
  return [route, go];
}

export type Theme = 'claro' | 'oscuro';
const THEME_KEY = 'ledger.tema';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'oscuro' ? 'oscuro' : 'claro'));
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'claro' ? 'oscuro' : 'claro';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* sin almacenamiento: el tema vale solo para esta sesión */
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}

/** ¿El foco está en un campo donde escribir? Entonces los atajos de una tecla no aplican. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}
