import { useCallback, useEffect, useRef, useState } from 'react';
import type { Transaction } from '../domain/types';
import { Icon, type IconName } from './components/Icon';
import { Modal } from './components/Modal';
import { TransactionForm } from './components/TransactionForm';
import { isTyping, ROUTES, useRoute, useTheme, type RoutePath } from './hooks';
import { InstallButton, UpdateBanner } from './components/PwaControls';
import { Accounts } from './pages/Accounts';
import { Budgets } from './pages/Budgets';
import { DataPage } from './pages/DataPage';
import { Dashboard } from './pages/Dashboard';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Transactions } from './pages/Transactions';
import { LedgerProvider } from './store';
import { ToastProvider } from './toast';

const ICONS: Record<RoutePath, IconName> = {
  panel: 'panel',
  movimientos: 'list',
  presupuestos: 'target',
  informes: 'chart',
  cuentas: 'wallet',
  datos: 'data',
  ajustes: 'settings',
};

const SHORTCUTS: [string, string][] = [
  ['N', 'Nuevo movimiento'],
  ['/', 'Buscar movimientos'],
  ['G luego P', 'Ir al panel'],
  ['G luego M', 'Ir a movimientos'],
  ['G luego B', 'Ir a presupuestos'],
  ['G luego I', 'Ir a informes'],
  ['G luego C', 'Ir a cuentas'],
  ['G luego D', 'Ir a importar y respaldo'],
  ['G luego A', 'Ir a ajustes'],
  ['T', 'Cambiar tema claro/oscuro'],
  ['?', 'Ver esta ayuda'],
  ['Esc', 'Cerrar cuadros de diálogo'],
];

export default function App() {
  return (
    <ToastProvider>
      <LedgerProvider>
        <Shell />
      </LedgerProvider>
    </ToastProvider>
  );
}

function Shell() {
  const [route, go] = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [txModal, setTxModal] = useState<{ open: boolean; editing: Transaction | null }>({ open: false, editing: null });
  const [help, setHelp] = useState(false);
  const chord = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const openNew = useCallback(() => setTxModal({ open: true, editing: null }), []);
  const closeTx = useCallback(() => setTxModal((s) => ({ ...s, open: false })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      if (chord.current !== null) {
        window.clearTimeout(chord.current);
        chord.current = null;
        const target = ROUTES.find((r) => r.key === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          go(target.path);
        }
        return;
      }
      switch (e.key) {
        case 'n':
          e.preventDefault();
          openNew();
          break;
        case '/':
          e.preventDefault();
          go('movimientos');
          window.setTimeout(() => document.getElementById('buscar')?.focus(), 60);
          break;
        case 't':
          toggleTheme();
          break;
        case '?':
          setHelp(true);
          break;
        case 'g':
          chord.current = window.setTimeout(() => (chord.current = null), 1200);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, openNew, toggleTheme]);

  useEffect(() => {
    const current = ROUTES.find((r) => r.path === route);
    document.title = `${current?.label ?? 'Panel'} · Ledger`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route]);

  const themeLabel = theme === 'claro' ? 'Tema oscuro' : 'Tema claro';

  return (
    <div className="shell">
      <a className="skip" href="#contenido" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Saltar al contenido</a>

      <aside className="sidebar">
        <a className="brand" href="#/panel" aria-label="Ledger, ir al panel">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Ledger</span>
        </a>
        <button type="button" className="btn side-new" onClick={openNew}><Icon name="plus" size={18} /> Nuevo movimiento</button>
        <nav aria-label="Principal">
          <ul className="nav">
            {ROUTES.map((r) => (
              <li key={r.path}>
                <a href={`#/${r.path}`} className="nav__link" aria-current={route === r.path ? 'page' : undefined}>
                  <Icon name={ICONS[r.path]} /> <span>{r.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__foot">
          <button type="button" className="side-btn" onClick={() => setHelp(true)}><Icon name="keyboard" size={18} /> Atajos <kbd>?</kbd></button>
          <button type="button" className="side-btn" onClick={toggleTheme} aria-label={themeLabel}><Icon name={theme === 'claro' ? 'moon' : 'sun'} size={18} /> {themeLabel}</button>
          <InstallButton />
          <p className="sidebar__note">Tus datos viven solo en este navegador. Funciona sin conexión.</p>
        </div>
      </aside>

      <header className="topbar">
        <a className="brand brand--small" href="#/panel" aria-label="Ledger, ir al panel">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Ledger</span>
        </a>
        <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={themeLabel}><Icon name={theme === 'claro' ? 'moon' : 'sun'} /></button>
      </header>

      <main id="contenido" ref={mainRef} tabIndex={-1} className="main">
        {route === 'panel' && <Dashboard onNew={openNew} go={go} />}
        {route === 'movimientos' && <Transactions onNew={openNew} onEdit={(tx) => setTxModal({ open: true, editing: tx })} />}
        {route === 'presupuestos' && <Budgets />}
        {route === 'informes' && <Reports />}
        {route === 'cuentas' && <Accounts />}
        {route === 'datos' && <DataPage />}
        {route === 'ajustes' && <Settings />}
      </main>

      <button type="button" className="fab" onClick={openNew} aria-label="Nuevo movimiento"><Icon name="plus" size={26} /></button>

      <nav className="bottom-nav" aria-label="Principal (móvil)">
        {ROUTES.map((r) => (
          <a key={r.path} href={`#/${r.path}`} aria-current={route === r.path ? 'page' : undefined} aria-label={r.label}>
            <Icon name={ICONS[r.path]} size={22} />
            <span>{r.short}</span>
          </a>
        ))}
      </nav>

      <UpdateBanner />

      <TransactionForm open={txModal.open} editing={txModal.editing} onClose={closeTx} />

      <Modal open={help} onClose={() => setHelp(false)} title="Atajos de teclado">
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys}><dt>{keys.split(' ').map((k, i) => (k === 'luego' ? <span key={i} className="muted"> luego </span> : <kbd key={i}>{k}</kbd>))}</dt><dd>{label}</dd></div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
