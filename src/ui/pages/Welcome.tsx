import { Icon } from '../components/Icon';

interface WelcomeProps {
  persistent: boolean;
  onEmpty: () => void;
  onSample: () => void;
}

/** Primera ejecución: el usuario elige cómo empezar su libro. La elección queda guardada con los datos. */
export function Welcome({ persistent, onEmpty, onSample }: WelcomeProps) {
  return (
    <main className="welcome" aria-labelledby="bienvenida-titulo">
      <div className="welcome__card">
        <span className="brand__mark welcome__mark" aria-hidden="true" />
        <p className="welcome__eyebrow">Ledger · Finanzas personales</p>
        <h1 id="bienvenida-titulo">Bienvenido a tu libro de cuentas</h1>
        <p className="welcome__lead">
          Registra tus movimientos, fija presupuestos por mes y mira a dónde se va tu dinero. Todo se guarda en este navegador, en pesos colombianos, sin cuentas ni servidores.
        </p>
        <ul className="welcome__points">
          <li><Icon name="check" size={18} /> Funciona sin conexión y se puede instalar como aplicación.</li>
          <li><Icon name="check" size={18} /> Importa y exporta CSV; respaldo completo en un archivo.</li>
          <li><Icon name="check" size={18} /> Tus datos no salen de tu dispositivo.</li>
        </ul>
        <div className="welcome__choices">
          <button type="button" className="welcome__choice welcome__choice--main" onClick={onEmpty} data-testid="empezar-vacio">
            <strong>Empezar con una base vacía</strong>
            <span>Una cuenta de efectivo y las categorías básicas. Tú registras lo demás.</span>
          </button>
          <button type="button" className="welcome__choice" onClick={onSample} data-testid="cargar-ejemplo">
            <strong>Cargar datos de ejemplo</strong>
            <span>Seis meses de movimientos, tres cuentas y presupuestos para explorar la aplicación. Puedes borrarlos cuando quieras.</span>
          </button>
        </div>
        {!persistent && (
          <p className="banner banner--alert" role="status">
            <Icon name="alert" size={20} /> Tu navegador bloquea el almacenamiento local: los cambios se perderán al cerrar la pestaña.
          </p>
        )}
        <p className="welcome__note">Podrás cambiar de opinión después desde «Ajustes» y «Importar y respaldo».</p>
      </div>
    </main>
  );
}
