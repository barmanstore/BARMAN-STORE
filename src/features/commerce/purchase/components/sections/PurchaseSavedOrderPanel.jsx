import { CheckCircle2, Eye, MessageCircle, X } from 'lucide-react';

const PurchaseSavedOrderPanel = ({
  lastSavedOrderSummary,
  onOpenOrder,
  onNewOrder,
  onPrepareWhatsApp,
  onDismiss,
  sendingWhatsAppOrderId,
  formatCurrency,
  className = '',
}) => {
  if (!lastSavedOrderSummary) return null;

  const orderId = lastSavedOrderSummary?.id;
  const isSending = String(sendingWhatsAppOrderId || '') === String(orderId || '');
  const poNumber = String(lastSavedOrderSummary?.poNumber || '').trim() || 'Pending number';
  const createdMode = lastSavedOrderSummary?.mode === 'updated' ? 'updated' : 'created';

  return (
    <section className={`purchase-save-handoff-card ${className}`.trim()}>
      <div className="purchase-save-handoff-head">
        <div>
          <span className="purchase-save-handoff-kicker">Purchase order {createdMode}</span>
          <h3>{createdMode === 'updated' ? 'Purchase Order Updated' : 'Purchase Order Created'}</h3>
          <p>The PO is saved. Open it for review or start the next one from here.</p>
        </div>
        <div className="purchase-save-handoff-head-actions">
          <CheckCircle2 size={18} aria-hidden="true" />
          {typeof onDismiss === 'function' ? (
            <button
              type="button"
              className="action-btn"
              onClick={onDismiss}
              title="Dismiss latest saved PO"
              aria-label="Dismiss latest saved PO"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="purchase-save-handoff-summary">
        <div className="purchase-save-handoff-summary-item">
          <span>PO Number</span>
          <strong>{poNumber}</strong>
        </div>
        <div className="purchase-save-handoff-summary-item">
          <span>Supplier</span>
          <strong>{lastSavedOrderSummary?.distributorName || 'Supplier selected'}</strong>
        </div>
        <div className="purchase-save-handoff-summary-item">
          <span>Total</span>
          <strong>{formatCurrency(lastSavedOrderSummary?.totalAmount || 0)}</strong>
        </div>
      </div>

      <div className="purchase-save-handoff-actions">
        {orderId ? (
          <button
            type="button"
            className="admin-btn primary"
            onClick={() => onOpenOrder?.(orderId)}
          >
            <Eye size={18} /> View PO
          </button>
        ) : null}
        {typeof onNewOrder === 'function' ? (
          <button type="button" className="admin-btn secondary" onClick={() => onNewOrder()}>
            New PO
          </button>
        ) : null}
        {orderId ? (
          <button
            type="button"
            className="admin-btn secondary"
            onClick={() => onPrepareWhatsApp?.({ id: orderId })}
            disabled={isSending}
          >
            <MessageCircle size={18} />
            {isSending ? 'Preparing...' : 'Prepare WhatsApp (Manual)'}
          </button>
        ) : null}
      </div>
    </section>
  );
};

export default PurchaseSavedOrderPanel;
