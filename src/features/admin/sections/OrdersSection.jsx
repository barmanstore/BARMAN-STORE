import AdminPageHeader from '../../../components/admin/AdminPageHeader';
import { formatCurrency, truncateUserName } from '../../../utils/formatters';

function OrdersSection({
  ordersSearchQuery,
  setOrdersSearchQuery,
  visibleOrders,
  orders,
  openApproveModal,
  handleProceedToBilling,
  proceedBillingOrderId,
  handleApplyPendingFulfillment,
  formatCurrencyColored,
}) {
  return (

          <div className="orders-management">
            <AdminPageHeader className="section-header" title="Orders Management" />
            <div className="orders-toolbar">
              <input
                id="orders-search"
                name="orders_search"
                type="text"
                className="orders-search-input"
                aria-label="Search orders"
                placeholder="Search order #, customer, email, status..."
                value={ordersSearchQuery}
                onChange={(e) => setOrdersSearchQuery(e.target.value)}
              />
              <span className="orders-search-count">
                Showing {visibleOrders.length} of {orders.length} orders
              </span>
            </div>
            <div className="orders-mobile-list">
              {visibleOrders.length === 0 ? (
                <p className="orders-empty-text">No orders match your search.</p>
              ) : visibleOrders.map((order) => {
                const isOrdered = String(order.status || '').toLowerCase() === 'ordered';
                const isReceived = String(order.status || '').toLowerCase() === 'received';
                const isBilled = Boolean(Number(order.bill_id || 0) || String(order.linked_bill_number || '').trim());
                const pendingQty = Math.max(0, Number(order?.pending_qty || 0));
                const canProceedBilling = !isBilled && (isOrdered || isReceived);
                return (
                  <article key={`mobile-${order.id}`} className="order-mobile-card">
                    <div className="order-mobile-head">
                      <div className="order-mobile-title">
                        <strong>#{order.order_number || order.id}</strong>
                        <span className="order-mobile-date">{new Date(order.created_at).toLocaleDateString()}</span>
                      </div>
                      <span className={`status ${order.status}`}>{order.status}</span>
                    </div>
                    <div className="order-mobile-meta">
                      <p><strong>{truncateUserName(order.customer_name || '-', 15)}</strong></p>
                      <p>{formatCurrency(order.total_amount || 0)}</p>
                    </div>
                    {pendingQty > 0 ? (
                      <p className="order-mobile-subtle">Partial stock: Pending {pendingQty}</p>
                    ) : null}
                    {isBilled ? (
                      <p className="order-mobile-subtle">Bill: {order.linked_bill_number || `#${order.bill_id}`}</p>
                    ) : null}
                    {(isOrdered || isReceived) ? (
                      <div className="order-mobile-actions">
                        {isOrdered ? (
                          <button className="admin-btn primary order-action-btn" onClick={() => openApproveModal(order.id)}>Mark Received</button>
                        ) : null}
                        {canProceedBilling ? (
                          <button
                            className="admin-btn order-action-btn"
                            onClick={() => handleProceedToBilling(order)}
                            disabled={proceedBillingOrderId === Number(order.id)}
                          >
                            {proceedBillingOrderId === Number(order.id)
                              ? 'Opening...'
                              : isOrdered
                                ? 'Confirm + Billing'
                                : 'Proceed Billing'}
                          </button>
                        ) : (
                          <span className="order-mobile-muted">Already billed</span>
                        )}
                        {isReceived && pendingQty > 0 ? (
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
                );
              })}
            </div>
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
                  {visibleOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="orders-empty-row">No orders match your search.</td>
                    </tr>
                  ) : visibleOrders.map((order) => {
                    const isOrdered = String(order.status || '').toLowerCase() === 'ordered';
                    const isReceived = String(order.status || '').toLowerCase() === 'received';
                    const isBilled = Boolean(Number(order.bill_id || 0) || String(order.linked_bill_number || '').trim());
                    const pendingQty = Math.max(0, Number(order?.pending_qty || 0));
                    const canProceedBilling = !isBilled && (isOrdered || isReceived);
                    return (
                      <tr key={order.id}>
                        <td>#{order.order_number || order.id}</td>
                        <td>
                          <div className="order-customer-cell">
                            <strong>{truncateUserName(order.customer_name || '-', 15)}</strong>
                            <span>{order.customer_email || '-'}</span>
                          </div>
                        </td>
                        <td>{formatCurrencyColored(order.total_amount)}</td>
                        <td>
                          <span className={`status ${order.status}`}>{order.status}</span>
                          {pendingQty > 0 ? (
                            <div className="order-status-detail pending">
                              Partial stock: Pending {pendingQty}
                            </div>
                          ) : null}
                          {isBilled ? (
                            <div className="order-status-detail billed">
                              Bill: {order.linked_bill_number || `#${order.bill_id}`}
                            </div>
                          ) : null}
                        </td>
                        <td>{new Date(order.created_at).toLocaleDateString()}</td>
                        <td>
                          {(isOrdered || isReceived) ? (
                            <div className="order-actions">
                              {isOrdered ? (
                                <button className="admin-btn primary order-action-btn" onClick={() => openApproveModal(order.id)}>Mark Received</button>
                              ) : null}
                              {canProceedBilling ? (
                                <button
                                  className="admin-btn order-action-btn"
                                  onClick={() => handleProceedToBilling(order)}
                                  disabled={proceedBillingOrderId === Number(order.id)}
                                >
                                  {proceedBillingOrderId === Number(order.id)
                                    ? 'Opening...'
                                    : isOrdered
                                      ? 'Confirm + Billing'
                                      : 'Proceed Billing'}
                                </button>
                              ) : (
                                <span className="order-mobile-muted">Already billed</span>
                              )}
                              {isReceived && pendingQty > 0 ? (
                                <button
                                  className="admin-btn order-action-btn"
                                  onClick={() => handleApplyPendingFulfillment(order.id)}
                                >
                                  Apply Pending
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="order-mobile-muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
  );
}

export default OrdersSection;
