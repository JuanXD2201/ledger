import type { LedgerData, Transaction } from '../../domain/types';
import { formatDate } from '../../domain/format';
import { Amount } from './common';
import { Icon } from './Icon';

export function describeTx(tx: Transaction, data: LedgerData) {
  const account = data.accounts.find((a) => a.id === tx.accountId)?.name ?? 'Cuenta eliminada';
  const category = data.categories.find((c) => c.id === tx.categoryId);
  if (tx.type === 'transfer') {
    const to = data.accounts.find((a) => a.id === tx.toAccountId)?.name ?? 'Cuenta eliminada';
    return { title: tx.note || 'Transferencia', category: 'Transferencia', color: 'var(--ink-3)', accountLabel: `${account} → ${to}` };
  }
  return { title: tx.note || category?.name || 'Movimiento', category: category?.name ?? 'Sin categoría', color: category?.color ?? 'var(--ink-3)', accountLabel: account };
}

interface Props {
  txs: Transaction[];
  data: LedgerData;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  caption: string;
}

export function TxTable({ txs, data, onEdit, onDelete, caption }: Props) {
  const withActions = Boolean(onEdit || onDelete);
  return (
    <table className="tx-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Detalle</th>
          <th scope="col">Cuenta</th>
          <th scope="col" className="num-col">Monto</th>
          {withActions && <th scope="col"><span className="sr-only">Acciones</span></th>}
        </tr>
      </thead>
      <tbody>
        {txs.map((tx) => {
          const d = describeTx(tx, data);
          return (
            <tr key={tx.id} data-testid="tx-row">
              <td className="tx-date">{formatDate(tx.date)}</td>
              <td className="tx-main">
                <span className="tx-title">
                  <i className="dot" style={{ background: d.color }} aria-hidden="true" />
                  {d.title}
                  {tx.recurringId && (
                    <span className="tx-recurring" title="Generado por un movimiento recurrente">
                      <Icon name="repeat" size={13} />
                      <span className="sr-only">Recurrente</span>
                    </span>
                  )}
                </span>
                <span className="tx-sub">
                  {tx.note && d.category !== d.title ? `${d.category}` : ''}
                  {tx.tags.length > 0 && <span className="tags">{tx.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</span>}
                </span>
              </td>
              <td className="tx-account">{d.accountLabel}</td>
              <td className="num-col">
                <Amount value={tx.amount} tone={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'neutral'} signed />
              </td>
              {withActions && (
                <td className="tx-actions">
                  {onEdit && (
                    <button type="button" className="icon-btn" onClick={() => onEdit(tx)} aria-label={`Editar ${d.title}`}>
                      <Icon name="edit" size={18} />
                    </button>
                  )}
                  {onDelete && (
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => onDelete(tx)} aria-label={`Eliminar ${d.title}`}>
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
