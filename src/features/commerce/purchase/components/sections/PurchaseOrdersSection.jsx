import { useState } from 'react';
import {
  BarChart3,
  BellRing,
  CheckCheck,
  Clock,
  DollarSign,
  Eye,
  MessageCircle,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Truck,
  Wallet,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Trash2,
} from 'lucide-react';
import WindowModal from '../../../../../shared/components/window/WindowModal';

const PurchaseOrdersSection = ({
  filters,
  distributors,
  onFilterChange,
  onOpenLedgerForm,
  onOpenReturn,
  onNewOrder,
  purchaseOrders,
  isPoEditable,
  canAddPaymentToPo,
  canReceivePo,
  canClosePo,
  getPoPaymentStatus,
  handleViewOrder,
  handleOpenProcessModal,
  handleSendDistributorWhatsApp,
  sendingWhatsAppOrderId,
  handleReceiveClick,
  handleOpenPoPaymentModal,
  handleOpenPoCorrectionForm,
  poCorrectionSubmitting,
  handleUpdateStatus,
  handleDeleteOrder,
  getOrderDisplayTotal,
  getStatusBadge,
  getPoPaymentBadge,
  getPoBalanceDue,
  getPoNextAction,
  formatCurrency,
}) => {
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState(null);

  const handleRequestDelete = (order) => {
    setPendingDeleteOrder(order || null);
  };

  const handleCancelDelete = () => {
    setPendingDeleteOrder(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteOrder) return;
    await handleDeleteOrder(pendingDeleteOrder.id);
    setPendingDeleteOrder(null);
  };

  return (
    <section className="purchase-section-shell">
      <div className="purchase-section-header">
        <div>
          <h2>Purchase Orders</h2>
          <p>Prepare, confirm, receive, pay, and close purchase orders in one section.</p>
        </div>
        <div className="action-buttons">
          <button className="admin-btn secondary" onClick={onOpenLedgerForm}>
            <Plus size={18} /> Payment / Credit Entry
          </button>
          <button className="admin-btn secondary" onClick={onOpenReturn}>
            <RotateCcw size={18} /> Return / Exchange
          </button>
          <button className="admin-btn primary" onClick={onNewOrder}>
            <Plus size={18} /> New Order
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="purchase-orders-filter-distributor">Distributor:</label>
          <select id="purchase-orders-filter-distributor" name="distributor_id" value={filters.distributor_id} onChange={onFilterChange}>
            <option value="">All Distributors</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="purchase-orders-filter-status">PO Status:</label>
          <select id="purchase-orders-filter-status" name="status" value={filters.status} onChange={onFilterChange}>
            <option value="">All PO Status</option>
            <option value="prepared">Prepared</option>
            <option value="sent">Sent</option>
            <option value="revised">Revised</option>
            <option value="confirmed">Confirmed</option>
            <option value="part_paid">Part Paid</option>
            <option value="fully_paid">Fully Paid</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="purchase-orders-filter-payment">Payment:</label>
          <select id="purchase-orders-filter-payment" name="payment_status" value={filters.payment_status} onChange={onFilterChange}>
            <option value="">All Payment</option>
            <option value="unpaid">Unpaid</option>
            <option value="part_paid">Part Paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="purchase-orders-filter-from">From:</label>
          <input id="purchase-orders-filter-from" type="date" name="start_date" value={filters.start_date} onChange={onFilterChange} />
        </div>
        <div className="filter-group">
          <label htmlFor="purchase-orders-filter-to">To:</label>
          <input id="purchase-orders-filter-to" type="date" name="end_date" value={filters.end_date} onChange={onFilterChange} />
        </div>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Distributor</th>
              <th>Items</th>
              <th>Total</th>
              <th>PO Status</th>
              <th>Payment</th>
              <th>Balance Due</th>
              <th>Due Date</th>
              <th>Next Action</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty-state">
                  <div className="purchase-empty-state-card">
                    <strong>No purchase orders yet.</strong>
                    <p>Create a purchase order to start tracking supplier items, receiving, and balance due.</p>
                    <button type="button" className="admin-btn primary" onClick={onNewOrder}>
                      <Plus size={18} /> Create First Order
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              purchaseOrders.map((order) => {
                const isEditableOrder = isPoEditable(order);
                const isPaymentEligible = canAddPaymentToPo(order);
                const isReceivableOrder = canReceivePo(order);
                const isCloseEligible = canClosePo(order);
                const poPaymentStatus = getPoPaymentStatus(order);
                return (
                  <tr key={order.id}>
                    <td data-label="PO Number"><strong>{order.po_number}</strong></td>
                    <td data-label="Distributor">{order.distributor_name}</td>
                    <td data-label="Items">{order.items?.length || 0}</td>
                    <td data-label="Total">{formatCurrency(getOrderDisplayTotal(order))}</td>
                    <td data-label="PO Status">{getStatusBadge(order)}</td>
                    <td data-label="Payment">{getPoPaymentBadge(order)}</td>
                    <td data-label="Balance Due">{formatCurrency(getPoBalanceDue(order))}</td>
                    <td data-label="Due Date">{order.payment_due_date ? new Date(order.payment_due_date).toLocaleDateString() : '-'}</td>
                    <td data-label="Next Action">{getPoNextAction(order)}</td>
                    <td className="actions-cell" data-label="Actions">
                      <button className="action-btn view" title="View Details" onClick={() => handleViewOrder(order.id)}>
                        <Eye size={16} />
                      </button>
                      {isEditableOrder ? (
                        <>
                          <button className="action-btn" title="Confirm" onClick={() => handleOpenProcessModal(order)}>
                            <Check size={16} />
                          </button>
                          <button
                            className="action-btn whatsapp"
                            title={sendingWhatsAppOrderId === order.id ? 'Preparing WhatsApp...' : 'Prepare WhatsApp (Manual)'}
                            aria-label="Prepare WhatsApp (Manual)"
                            onClick={() => handleSendDistributorWhatsApp(order)}
                            disabled={sendingWhatsAppOrderId === order.id}
                          >
                            <MessageCircle size={16} />
                          </button>
                        </>
                      ) : null}
                      {isReceivableOrder ? (
                        <button className="action-btn receive" title="Receive Items" onClick={() => handleReceiveClick(order)}>
                          <Truck size={16} />
                        </button>
                      ) : null}
                      {isPaymentEligible && poPaymentStatus !== 'paid' ? (
                        <button className="action-btn receive" title="Add Payment" onClick={() => handleOpenPoPaymentModal(order)}>
                          <DollarSign size={16} />
                        </button>
                      ) : null}
                      {isPaymentEligible ? (
                        <button
                          className="action-btn correction"
                          title="Correct Ledger Impact"
                          onClick={() => handleOpenPoCorrectionForm(order)}
                          disabled={poCorrectionSubmitting}
                        >
                          <ArrowUpDown size={16} />
                        </button>
                      ) : null}
                      {isCloseEligible ? (
                        <button className="action-btn" title="Close Purchase Order" onClick={() => handleUpdateStatus(order.id, 'closed')}>
                          <CheckCheck size={16} />
                        </button>
                      ) : null}
                      {isEditableOrder ? (
                        <button className="action-btn delete" title="Delete" onClick={() => handleRequestDelete(order)}>
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pendingDeleteOrder ? (
        <WindowModal
          open
          title="Delete Purchase Order"
          onClose={handleCancelDelete}
          dismissible
          themeClassName="purchase-management"
          dialogClassName="purchase-modal-frame"
          headerClassName="purchase-modal-header"
          closeButtonClassName="purchase-modal-close-btn"
          initialSize={{ width: 520, height: 260 }}
        >
          <div className="purchase-confirm-delete">
            <p>
              Delete PO <strong>{pendingDeleteOrder.po_number || `#${pendingDeleteOrder.id}`}</strong>
              {pendingDeleteOrder.distributor_name ? ` for ${pendingDeleteOrder.distributor_name}` : ''}?
            </p>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={handleCancelDelete}>
                Cancel
              </button>
              <button type="button" className="submit-btn" onClick={handleConfirmDelete}>
                Delete PO
              </button>
            </div>
          </div>
        </WindowModal>
      ) : null}
    </section>
  );
};

export default PurchaseOrdersSection;
