import { useState, type FormEvent } from 'react';
import { checkForUpdate } from '../../pwa';
import { createBackup } from '../../domain/schema';
import { PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { InstallButton, usePwa } from '../components/PwaControls';
import { downloadText } from '../download';
import { APP_VERSION, useSettings } from '../settings';
import { useLedger } from '../store';
import { useToast } from '../toast';

const CONFIRM_WORD = 'BORRAR';

export function Settings() {
  const ledger = useLedger();
  const { data, today } = ledger;
  const toast = useToast();
  const pwa = usePwa();
  const [settings, saveSettings] = useSettings();
  const [holder, setHolder] = useState(settings.holder);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [wiping, setWiping] = useState(false);

  const submitHolder = (e: FormEvent) => {
    e.preventDefault();
    saveSettings({ holder });
    toast({ message: holder.trim() ? 'Nombre del titular guardado.' : 'Nombre del titular eliminado.' });
  };

  const exportBackup = () => {
    downloadText(`ledger-respaldo-${today}.json`, JSON.stringify(createBackup(data), null, 2), 'application/json');
    toast({ message: 'Respaldo descargado.' });
  };

  const closeWipe = () => {
    setWipeOpen(false);
    setTyped('');
  };

  const checkUpdates = async () => {
    try {
      await checkForUpdate();
      toast({ message: 'Búsqueda terminada. Si hay una versión nueva, verás el aviso para recargar.' });
    } catch {
      toast({ message: 'No se pudo buscar actualizaciones (¿sin conexión?).', tone: 'warn' });
    }
  };

  const wipe = async () => {
    setWiping(true);
    await ledger.wipeAll();
  };

  const counts = `${data.transactions.length} movimientos, ${data.accounts.length} cuentas, ${data.budgets.length} presupuestos y ${data.recurring.length} recurrentes`;

  return (
    <>
      <PageHeader title="Ajustes" lead="Preferencias del libro, respaldo y datos de la aplicación." />

      <div className="grid-2">
        <section className="panel" aria-labelledby="h-titular">
          <h2 id="h-titular" className="h-serif">Titular</h2>
          <form className="form" onSubmit={submitHolder} noValidate>
            <div className="field">
              <label htmlFor="titular">Nombre del titular</label>
              <input id="titular" className="input" maxLength={60} autoComplete="name" placeholder="Tu nombre" value={holder} onChange={(e) => setHolder(e.target.value)} />
              <p className="muted small">Se muestra en el panel. Se guarda solo en este navegador.</p>
            </div>
            <div className="form__actions">
              <span className="spacer" />
              <button type="submit" className="btn">Guardar nombre</button>
            </div>
          </form>
        </section>

        <section className="panel" aria-labelledby="h-moneda">
          <h2 id="h-moneda" className="h-serif">Moneda</h2>
          <p className="settings-currency"><strong>Peso colombiano (COP)</strong></p>
          <p className="muted">Ledger trabaja con una sola moneda, en pesos enteros y sin decimales. No se puede cambiar.</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="h-respaldo">
        <h2 id="h-respaldo" className="h-serif">Respaldo</h2>
        <p className="muted">Tu libro tiene {counts}. Un respaldo es un archivo JSON que puedes restaurar desde «Importar y respaldo», en este u otro dispositivo.</p>
        <div className="row">
          <button type="button" className="btn" onClick={exportBackup}><Icon name="download" size={18} /> Exportar respaldo</button>
          <a className="btn btn--ghost" href="#/datos">Importar o restaurar</a>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="h-app">
          <h2 id="h-app" className="h-serif">Aplicación</h2>
          <dl className="ledger-rows" data-testid="info-app">
            <div><dt>Versión</dt><dd data-testid="version">{APP_VERSION}</dd></div>
            <div><dt>Instalación</dt><dd>{pwa.installed ? 'Instalada como aplicación' : pwa.canInstall ? 'Disponible para instalar' : 'Se ejecuta en el navegador'}</dd></div>
            <div><dt>Sin conexión</dt><dd>{pwa.offlineReady ? 'Lista: funciona sin internet' : 'Preparándose…'}</dd></div>
            <div><dt>Licencia</dt><dd>MIT</dd></div>
          </dl>
          <div className="row">
            <InstallButton className="btn btn--ghost" />
            <button type="button" className="btn btn--ghost" onClick={() => void checkUpdates()}>Buscar actualizaciones</button>
          </div>
        </section>

        <section className="panel" aria-labelledby="h-acerca">
          <h2 id="h-acerca" className="h-serif">Acerca de Ledger</h2>
          <p className="muted">Finanzas personales para quien prefiere llevar sus cuentas en privado. Todo lo que registras se guarda en este navegador (localStorage): no hay servidor, cuentas de usuario ni envío de datos. Si borras los datos del sitio desde el navegador, pierdes el libro; por eso conviene exportar un respaldo de vez en cuando.</p>
          <p className="muted small">© 2026 Juan Esteban Olaya Muñoz · Licencia MIT.</p>
        </section>
      </div>

      <section className="panel panel--danger" aria-labelledby="h-borrar">
        <h2 id="h-borrar" className="h-serif">Borrar todos los datos</h2>
        <p className="muted">Elimina de este navegador los movimientos, cuentas, presupuestos, recurrentes y ajustes, y vuelve a la pantalla de bienvenida. No se puede deshacer: exporta un respaldo antes.</p>
        <button type="button" className="btn btn--danger" onClick={() => setWipeOpen(true)}><Icon name="trash" size={18} /> Borrar todos los datos…</button>
      </section>

      <Modal open={wipeOpen} onClose={closeWipe} title="Borrar todos los datos">
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (typed === CONFIRM_WORD) void wipe(); }} noValidate>
          <p>Se borrarán {counts}. Esta acción no se puede deshacer.</p>
          <div className="field">
            <label htmlFor="confirmar-borrado">Escribe <strong>{CONFIRM_WORD}</strong> para confirmar</label>
            <input id="confirmar-borrado" className="input" autoComplete="off" autoCapitalize="characters" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={exportBackup}>Descargar respaldo antes</button>
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" onClick={closeWipe}>Cancelar</button>
            <button type="submit" className="btn btn--danger" disabled={typed !== CONFIRM_WORD || wiping}>Borrar definitivamente</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
