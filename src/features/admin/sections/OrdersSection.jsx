import { useMemo } from 'react';
import AdminPageHeader from '../components/AdminPageHeader';
import SignedCurrency from '../../../shared/components/SignedCurrency';
import { formatCurrency, truncateUserName } from '../../../shared/utils/formatters';

const ORDERS_PAGE_SIZE = 25;

const formatOrderDate = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

function OrdersSection({
  isMobile,
  ordersSearchQuery,
  setOrdersSearchQuery,
  visibleOrders,
  orders,
  ordersPage,
  setOrdersPage,
  ordersTotal,
  ordersLoading,
  openApproveModal,
  handleProceedToBilling,
  proceedBillingOrderId,
  handleApplyPendingFulfillment,
}) {
  const totalPages = Math.max(1, Math.ceil(Number(ordersTotal || 0) / ORDERS_PAGE_SIZE));

  const orderRows = useMemo(() => {
    const rows = Array.isArray(visibleOrders) ? visibleOrders : [];
    return rows.map((order) => {
      const statusLabel = String(order?.status || 'pending').trim() || 'pending';
      const statusKey = statusLabel.toLowerCase();
      const isOrdered = statusKey === 'ordered';
      const isReceived = statusKey === 'received';
      const isBilled = Boolean(Number(order?.bill_id || 0) || String(order?.linked_bill_number || '').trim());
      const requestedQty = Math.max(0, Number(order?.requested_qty || 0));
      const fulfilledQty = Math.max(0, Number(order?.fulfilled_qty || 0));
      const pendingQty = Math.max(0, Number(order?.pending_qty || 0));
      const canProceedBilling = !isBilled && (isOrdered || isReceived);
      const fulfillmentSummary = requestedQty > 0
        ? `${fulfilledQty}/${requestedQty} fulfilled`
        : 'Awaiting item allocation';

      return {
        ...order,
        statusLabel,
        statusKey,
        isOrdered,
        isReceived,
        isBilled,
        requestedQty,
        fulfilledQty,
        pendingQty,
        canProceedBilling,
        orderLabel: `#${order?.order_number || order?.id}`,
        createdLabel: formatOrderDate(order?.created_at),
        fulfillmentSummary,
      };
    });
  }, [visibleOrders]);

  const summaryCards = useMemo(() => {
    const counts = orderRows.reduce((acc, row) => {
      acc.awaitingReceipt += row.isOrdered ? 1 : 0;
      acc.readyBilling += row.canProceedBilling ? 1 : 0;
      acc.pendingQty += row.pendingQty > 0 ? 1 : 0;
      acc.billed += row.isBilled ? 1 : 0;
      return acc;
    }, {
      awaitingReceipt: 0,
      readyBilling: 0,
      pendingQty: 0,
      billed: 0,
    });

    return [
      {
        key: 'total',
        label: 'Matching orders',
        value: Number(ordersTotal || orders.length || 0),
        detail: `${orderRows.length} on this page`,
        tone: 'neutral',
      },
      {
        key: 'awaiting',
        label: 'Pending receipt',
        value: counts.awaitingReceipt,
        detail: 'Needs stock confirmation',
        tone: counts.awaitingReceipt > 0 ? 'attention' : 'neutral',
      },
      {
        key: 'billing',
        label: 'Ready for billing',
        value: counts.readyBilling,
        detail: 'Can move into billing now',
        tone: counts.readyBilling > 0 ? 'action' : 'neutral',
      },
      {
        key: 'pending',
        label: 'Pending quantity',
        value: counts.pendingQty,
        detail: 'Requires re-apply or follow-up',
        tone: counts.pendingQty > 0 ? 'attention' : 'neutral',
      },
      {
        key: 'billed',
        label: 'Already billed',
        value: counts.billed,
        detail: 'Closed on this page',
        tone: counts.billed > 0 ? 'success' : 'neutral',
      },
    ];
  }, [orderRows, orders.length, ordersTotal]);

  const pageStart = orderRows.length > 0 ? ((ordersPage - 1) * ORDERS_PAGE_SIZE) + 1 : 0;
  const pageEnd = orderRows.length > 0 ? pageStart + orderRows.length - 1 : 0;
  const totalMatches = Number(ordersTotal || orders.length || 0);
  const searchCountLabel = totalMatches > 0
    ? `Rows ${pageStart}-${pageEnd} of ${totalMatches}`
    : 'No matching orders';

  const handleSearchChange = (event) => {
    setOrdersPage(1);
    setOrdersSearchQuery(event.target.value);
  };

  return (
    <div className="orders-management">
      <AdminPageHeader
        className="section-header"
        title="Orders Management"
        subtitle="Receive stock, move eligible orders into billing, and clear pending quantities from one queue."
      />

      <div className="orders-toolbar">
        <input
          id="orders-search"
          name="orders_search"
          type="search"
          className="orders-search-input"
          aria-label="Search orders"
          placeholder="Search order #, customer, email, status..."
          value={ordersSearchQuery}
          onChange={handleSearchChange}
        />
        <div className="orders-toolbar-meta">
          <span className="orders-search-count">{searchCountLabel}</span>
          <span className="orders-search-count">Page {ordersPage} of {totalPages}</span>
        </div>
      </div>

      <div className="orders-summary-grid">
        {summaryCards.map((card) => (
          <div key={card.key} className={`orders-summary-card ${card.tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="admin-pagination">
        <span className="admin-pagination-label">
          Page {ordersPage} of {totalPages}
        </span>
        <div className="admin-pagination-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={() => setOrdersPage(Math.max(1, ordersPage - 1))}
            disabled={ordersPage <= 1 || ordersLoading}
          >
            Previous
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setOrdersPage(Math.min(totalPages, ordersPage + 1))}
            disabled={ordersPage >= totalPages || ordersLoading}
          >
            Next
          </button>
        </div>
      </div>

      {ordersLoading ? (
        <p className="admin-list-loading">Loading orders...</p>
      ) : null}

      {isMobile ? (
        <div className="orders-mobile-list">
          {orderRows.length === 0 ? (
            <p className="orders-empty-text">No orders match your search.</p>
          ) : orderRows.map((order) => (
            <article key={`mobile-${order.id}`} className="order-mobile-card">
              <div className="order-mobile-head">
                <div className="order-mobile-title">
                  <strong>{order.orderLabel}</strong>
                  <span className="order-mobile-date">{order.createdLabel}</span>
                </div>
                <span className={`status ${order.statusKey}`}>{order.statusLabel}</span>
              </div>
              <div className="order-mobile-meta">
                <p><strong>{truncateUserName(order.customer_name || '-', 15)}</strong></p>
                <p>{formatCurrency(order.total_amount || 0)}</p>
              </div>
              <p className="order-mobile-subtle">{order.fulfillmentSummary}</p>
              {order.pendingQty > 0 ? (
                <p className="order-mobile-subtle pending">Pending qty {order.pendingQty}</p>
              ) : null}
              {order.canProceedBilling ? (
                <p className="order-mobile-subtle ready">Ready for billing</p>
              ) : null}
              {order.isBilled ? (
                <p className="order-mobile-subtle">Bill: {order.linked_bill_number || `#${order.bill_id}`}</p>
              ) : null}
              {(order.isOrdered || order.isReceived) ? (
                <div className="order-mobile-actions">
                  {order.isOrdered ? (
                    <button className="admin-btn primary order-action-btn" onClick={() => openApproveModal(order.id)}>
                      Mark Received
                    </button>
                  ) : null}
                  {order.canProceedBilling ? (
                    <button
                      className="admin-btn order-action-btn"
                      onClick={() => handleProceedToBilling(order)}
                      disabled={proceedBillingOrderId === Number(order.id)}
                    >
                      {proceedBillingOrderId === Number(order.id)
                        ? 'Opening...'
                        : order.isOrdered
                          ? 'Confirm + Billing'
                          : 'Proceed Billing'}
                    </button>
                  ) : (
                    <span className="order-mobile-muted">{order.isBilled ? 'Already billed' : 'No pending action'}</span>
                  )}
                  {order.isReceived && order.pendingQty > 0 ? (
                    <button
                      className="admin-btn order-action-btn"
                      onClick={() => handleApplyPendingFulfillment(order.id)}
                    >
                      Apply Pending
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="order-mobile-muted">No pending action</span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.length === 0 ? (
                <tr>
                  <td colSpan="6" className="orders-empty-row">No orders match your search.</td>
                </tr>
              ) : orderRows.map((order) => (
                <tr key={order.id}>
                  <td>
                    <div className="order-order-cell">
                      <strong className="order-order-number">{order.orderLabel}</strong>
                      <span className="order-order-meta">{order.fulfillmentSummary}</span>
                    </div>
                  </td>
                  <td>
                    <div className="order-customer-cell">
                      <strong>{truncateUserName(order.customer_name || '-', 15)}</strong>
                      <span>{order.customer_email || '-'}</span>
                    </div>
                  </td>
                  <td><SignedCurrency amount={order.total_amount} /></td>
                  <td>
                    <div className="order-status-stack">
                      <span className={`status ${order.statusKey}`}>{order.statusLabel}</span>
                      {order.pendingQty > 0 ? (
                        <div className="order-status-detail pending">
                          Pending qty {order.pendingQty}
                        </div>
                      ) : null}
                      {order.canProceedBilling ? (
                        <div className="order-status-detail ready">
                          Ready for billing
                        </div>
                      ) : null}
                      {order.isBilled ? (
                        <div className="order-status-detail billed">
                          Bill: {order.linked_bill_number || `#${order.bill_id}`}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>{order.createdLabel}</td>
                  <td>
                    {(order.isOrdered || order.isReceived) ? (
                      <div className="order-actions">
                        {order.isOrdered ? (
                          <button className="admin-btn primary order-action-btn" onClick={() => openApproveModal(order.id)}>
                            Mark Received
                          </button>
                        ) : null}
                        {order.canProceedBilling ? (
                          <button
                            className="admin-btn order-action-btn"
                            onClick={() => handleProceedToBilling(order)}
                            disabled={proceedBillingOrderId === Number(order.id)}
                          >
                            {proceedBillingOrderId === Number(order.id)
                              ? 'Opening...'
                              : order.isOrdered
                                ? 'Confirm + Billing'
                                : 'Proceed Billing'}
                          </button>
                        ) : (
                          <span className="order-action-note">{order.isBilled ? 'Already billed' : 'No pending action'}</span>
                        )}
                        {order.isReceived && order.pendingQty > 0 ? (
                          <button
                            className="admin-btn order-action-btn"
                            onClick={() => handleApplyPendingFulfillment(order.id)}
                          >
                            Apply Pending
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="order-action-note">No pending action</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default OrdersSection;
