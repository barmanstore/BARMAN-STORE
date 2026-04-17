import { Eye, Plus } from 'lucide-react';
import PurchaseSavedOrderPanel from './PurchaseSavedOrderPanel';

const getOrderSortTime = (order) => {
  const rawValue = order?.created_at || order?.order_date || order?.expected_delivery || '';
  const parsed = new Date(rawValue).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const PurchasePopupWorkspacePanel = ({
  showOrderForm,
  onNewOrder,
  purchaseOrders,
  handleViewOrder,
  handleSendDistributorWhatsApp,
  sendingWhatsAppOrderId,
  getStatusBadge,
  getPoPaymentBadge,
  getPoNextAction,
  getOrderDisplayTotal,
  formatCurrency,
  lastSavedOrderSummary,
  clearLastSavedOrderSummary,
}) => {
  const recentOrders = (Array.isArray(purchaseOrders) ? purchaseOrders : [])
    .slice()
    .sort((left, right) => {
      const timeDelta = getOrderSortTime(right) - getOrderSortTime(left);
      if (timeDelta !== 0) return timeDelta;
      return Number(right?.id || 0) - Number(left?.id || 0);
    })
    .slice(0, 6);

  return (
    <aside className="purchase-popup-workspace-panel" aria-label="Purchase workspace status">
      <section className="purchase-popup-workspace-card purchase-popup-workspace-card--hero">
        <div>
          <h3>{showOrderForm ? 'Current draft is open' : 'No draft is open'}</h3>
          <p>
            {showOrderForm
              ? 'Stay in the left workspace to keep entering items. Recent purchase orders remain visible here for completion context.'
              : 'Start another purchase order or review the latest ones before the next action.'}
          </p>
        </div>
        {!showOrderForm ? (
          <button type="button" className="admin-btn primary" onClick={onNewOrder}>
            <Plus size={18} /> New Purchase Order
          </button>
        ) : null}
      </section>

      {!showOrderForm && lastSavedOrderSummary ? (
        <PurchaseSavedOrderPanel
          lastSavedOrderSummary={lastSavedOrderSummary}
          onOpenOrder={handleViewOrder}
          onNewOrder={onNewOrder}
          onPrepareWhatsApp={handleSendDistributorWhatsApp}
          onDismiss={clearLastSavedOrderSummary}
          sendingWhatsAppOrderId={sendingWhatsAppOrderId}
          formatCurrency={formatCurrency}
          className="purchase-popup-workspace-card purchase-popup-workspace-card--success"
        />
      ) : null}

      <section className="purchase-popup-workspace-card">
        <div className="purchase-popup-workspace-card-head">
          <div>
            <span className="purchase-popup-workspace-kicker">Recent POs</span>
            <h3>Recent Purchase Orders</h3>
          </div>
          <p>Keep the latest purchase activity visible after save.</p>
        </div>

        {recentOrders.length ? (
          <div className="purchase-popup-order-list" role="list" aria-label="Recent purchase orders">
            {recentOrders.map((order) => {
              const isLatestSaved = String(order?.id || '') === String(lastSavedOrderSummary?.id || '');
              return (
                <article
                  key={`purchase-popup-order-${order.id}`}
                  className={`purchase-popup-order-card${isLatestSaved ? ' latest-save' : ''}`}
                  role="listitem"
                >
                  <div className="purchase-popup-order-card-top">
                    <div>
                      <strong>{order.po_number || `PO #${order.id}`}</strong>
                      <p>{order.distributor_name || 'Distributor not available'}</p>
                    </div>
                    <button
                      type="button"
                      className="action-btn view"
                      title="View purchase order"
                      onClick={() => handleViewOrder(order.id)}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                  <div className="purchase-popup-order-card-meta">
                    <span>{new Date(order.created_at || order.order_date || order.expected_delivery || 0).toLocaleDateString()}</span>
                    <strong>{formatCurrency(getOrderDisplayTotal(order))}</strong>
                  </div>
                  <div className="purchase-popup-order-card-badges">
                    {getStatusBadge(order)}
                    {getPoPaymentBadge(order)}
                  </div>
                  <p className="purchase-popup-order-card-next">
                    Next: <strong>{getPoNextAction(order)}</strong>
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="purchase-empty-state-card purchase-empty-state-card--muted">
            <strong>No purchase orders yet.</strong>
            <p>Create the first purchase order to keep completion history visible in this workspace.</p>
          </div>
        )}
      </section>
    </aside>
  );
};

export default PurchasePopupWorkspacePanel;
