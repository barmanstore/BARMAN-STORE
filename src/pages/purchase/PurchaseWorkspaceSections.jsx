import { useMemo, useState } from 'react';
import {
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

const PurchaseSectionTabs = ({ activeTab, onChange, counts = {} }) => {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: Package },
    { key: 'orders', label: 'Orders', icon: Package },
    { key: 'payments', label: 'Payments', icon: Wallet },
    { key: 'reminders', label: 'Reminders', icon: BellRing, count: counts.reminders },
    { key: 'returns', label: 'Returns', icon: RotateCcw, count: counts.returns },
  ];

  return (
    <div className="sub-nav purchase-section-nav" role="tablist" aria-label="Purchase sections">
      {items.map((item) => {
        const Icon = item.icon;
        const count = Number(item.count || 0);
        return (
          <button
            key={item.key}
            type="button"
            className={activeTab === item.key ? 'active' : ''}
            onClick={() => onChange(item.key)}
            role="tab"
            aria-selected={activeTab === item.key}
          >
            <Icon size={18} />
            <span>{item.label}</span>
            {count > 0 ? <small>{count}</small> : null}
          </button>
        );
      })}
    </div>
  );
};

const sortPurchaseAnalyticsEntries = (entries = [], mode = 'balance_desc') => {
  const list = Array.isArray(entries) ? [...entries] : [];
  const asNumber = (value) => Number(value || 0);
  const asText = (value) => String(value || '').trim().toLowerCase();
  const asDate = (value) => String(value || '').trim();
  return list.sort((a, b) => {
    if (mode === 'name_asc') {
      return asText(a.distributor_name).localeCompare(asText(b.distributor_name));
    }
    if (mode === 'date_asc') {
      return asDate(a.schedule_date || a.payment_due_date || a.next_payment_due_date)
        .localeCompare(asDate(b.schedule_date || b.payment_due_date || b.next_payment_due_date))
        || asText(a.distributor_name).localeCompare(asText(b.distributor_name));
    }
    if (mode === 'overdue_desc') {
      return asNumber(b.overdue_amount || b.overdue_days) - asNumber(a.overdue_amount || a.overdue_days)
        || asNumber(b.due_today_amount || b.balance_due) - asNumber(a.due_today_amount || a.balance_due);
    }
    if (mode === 'ledger_desc') {
      return asNumber(b.ledger_balance) - asNumber(a.ledger_balance)
        || asNumber(b.po_balance_due || b.balance_due) - asNumber(a.po_balance_due || a.balance_due);
    }
    return asNumber(b.po_balance_due || b.balance_due || b.outstanding_amount)
      - asNumber(a.po_balance_due || a.balance_due || a.outstanding_amount)
      || asText(a.distributor_name).localeCompare(asText(b.distributor_name));
  });
};

const PurchaseDashboardSection = ({
  operationsLoading,
  operationsCardItems,
  operationsSummary,
  onDraftDistributor,
  onOpenOrder,
  onOpenPayable,
  onNewOrder,
  onOpenLedgerForm,
  onOpenReturn,
  formatCurrency,
  toNumber,
}) => {
  const [todaySort, setTodaySort] = useState('overdue_desc');
  const [tomorrowSort, setTomorrowSort] = useState('balance_desc');
  const [weeklySort, setWeeklySort] = useState('date_asc');
  const [predictionSort, setPredictionSort] = useState('balance_desc');

  const todayEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.today_distributors || [], todaySort),
    [operationsSummary.today_distributors, todaySort]
  );
  const tomorrowEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.tomorrow_distributors || [], tomorrowSort),
    [operationsSummary.tomorrow_distributors, tomorrowSort]
  );
  const weeklyEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.weekly_distributors || [], weeklySort),
    [operationsSummary.weekly_distributors, weeklySort]
  );
  const predictedEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.predicted_payments_today || [], predictionSort),
    [operationsSummary.predicted_payments_today, predictionSort]
  );

  const renderSort = (value, onChange) => (
    <select name="purchase_section_sort" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Sort section">
      <option value="balance_desc">Highest balance</option>
      <option value="overdue_desc">Most overdue</option>
      <option value="date_asc">Earliest date</option>
      <option value="ledger_desc">Highest ledger</option>
      <option value="name_asc">Name A-Z</option>
    </select>
  );

  return (
    <section className="purchase-section-shell">
      <div className="purchase-ops-hero">
        <div className="purchase-ops-header">
          <div>
            <h2>Today&apos;s Purchase Desk</h2>
            <p>Order-day planning, due payments, overdue tracking, and history-assisted distributor suggestions in one place.</p>
          </div>
          {operationsLoading && <span className="purchase-ops-loading">Refreshing...</span>}
        </div>
        <div className="purchase-ops-cards">
          {operationsCardItems.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className={`purchase-ops-card ${card.tone}`}>
                <div className="purchase-ops-card-head">
                  <span>{card.label}</span>
                  <Icon size={18} />
                </div>
                <strong>{card.value}</strong>
                <small>{card.meta}</small>
              </div>
            );
          })}
        </div>
        <div className="purchase-quick-actions">
          <button type="button" className="purchase-action-tile primary" onClick={onNewOrder}>
            <Plus size={18} />
            <span>New Purchase Order</span>
          </button>
          <button type="button" className="purchase-action-tile" onClick={onOpenLedgerForm}>
            <Wallet size={18} />
            <span>Ledger Entry</span>
          </button>
          <button type="button" className="purchase-action-tile" onClick={onOpenReturn}>
            <RotateCcw size={18} />
            <span>Return / Exchange</span>
          </button>
        </div>
        <div className="purchase-dashboard-grid">
          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Truck size={16} />
              <span>Today Order Day</span>
            </div>
            {renderSort(todaySort, setTodaySort)}
            {todayEntries.length ? (
              todayEntries.slice(0, 6).map((entry) => (
                <div key={`today-${entry.distributor_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</p>
                    <small>
                      Due today: {formatCurrency(toNumber(entry.due_today_amount))} | Overdue: {formatCurrency(toNumber(entry.overdue_amount))}
                    </small>
                    <small>
                      PO: {formatCurrency(toNumber(entry.po_balance_due))} | Ledger: {formatCurrency(toNumber(entry.ledger_balance))}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="admin-btn secondary small"
                    onClick={() => onDraftDistributor(entry.distributor_id, {
                      expected_delivery: entry.schedule_date,
                      suggested_items: entry.suggested_items || [],
                    })}
                  >
                    Draft PO
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No distributor is scheduled on order day today.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <BellRing size={16} />
              <span>Tomorrow PO Prep</span>
            </div>
            {renderSort(tomorrowSort, setTomorrowSort)}
            {tomorrowEntries.length ? (
              tomorrowEntries.slice(0, 6).map((entry) => (
                <div key={`tomorrow-${entry.distributor_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</p>
                    <small>{entry.schedule_day} | {entry.schedule_date}</small>
                    <small>Configured: {entry.configured_payment_due_days ?? '-'}d | Inferred: {entry.inferred_payment_due_days ?? '-'}d</small>
                  </div>
                  <button
                    type="button"
                    className="admin-btn secondary small"
                    onClick={() => onDraftDistributor(entry.distributor_id, {
                      expected_delivery: entry.schedule_date,
                      suggested_items: entry.suggested_items || [],
                    })}
                  >
                    Draft PO
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No distributor reminder due for tomorrow.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Package size={16} />
              <span>Weekly Schedule</span>
            </div>
            {renderSort(weeklySort, setWeeklySort)}
            {weeklyEntries.length ? (
              weeklyEntries.slice(0, 8).map((entry) => (
                <div key={`weekly-${entry.distributor_id}-${entry.schedule_date}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.schedule_day} | {entry.schedule_date}</p>
                    <small>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</small>
                  </div>
                  <button
                    type="button"
                    className="admin-btn secondary small"
                    onClick={() => onDraftDistributor(entry.distributor_id, {
                      expected_delivery: entry.schedule_date,
                      suggested_items: entry.suggested_items || [],
                    })}
                  >
                    Draft
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No weekly schedule is available.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Wallet size={16} />
              <span>Payables</span>
            </div>
            {(operationsSummary.payables || []).length ? (
              (operationsSummary.payables || []).slice(0, 4).map((entry) => (
                <div key={`payable-${entry.order_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.po_number} | {formatCurrency(toNumber(entry.balance_due))}</p>
                    <small>
                      Due: {entry.payment_due_date}{entry.overdue_days ? ` | ${entry.overdue_days} day overdue` : ''}
                    </small>
                    <small>
                      Strict: {entry.strict_due_date || '-'} | Inferred: {entry.inferred_due_date || '-'}
                    </small>
                  </div>
                  <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                    Pay
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No payable items due right now.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Sparkles size={16} />
              <span>Predicted Payments</span>
            </div>
            {renderSort(predictionSort, setPredictionSort)}
            {predictedEntries.length ? (
              predictedEntries.slice(0, 6).map((entry) => (
                <div key={`prediction-${entry.order_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.po_number} | {formatCurrency(toNumber(entry.balance_due))}</p>
                    <small>Configured: {entry.payment_due_date} | Inferred: {entry.inferred_due_date || '-'}</small>
                    <small>{entry.prediction_reason === 'overdue' ? 'Overdue' : 'Likely payment today'}</small>
                  </div>
                  <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                    Open
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No payment prediction is available for today.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Clock size={16} />
              <span>Next Actions</span>
            </div>
            {operationsSummary.workflow?.length ? (
              operationsSummary.workflow.slice(0, 5).map((entry) => (
                <div key={`workflow-${entry.order_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.po_number}</strong>
                    <p>{entry.distributor_name}</p>
                    <small>{entry.next_action}</small>
                  </div>
                  <button type="button" className="admin-btn secondary small" onClick={() => onOpenOrder(entry.order_id)}>
                    Open
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No urgent workflow items.</div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
};

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
}) => (
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
        <label>Distributor:</label>
        <select name="distributor_id" value={filters.distributor_id} onChange={onFilterChange}>
          <option value="">All Distributors</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>PO Status:</label>
        <select name="status" value={filters.status} onChange={onFilterChange}>
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
        <label>Payment:</label>
        <select name="payment_status" value={filters.payment_status} onChange={onFilterChange}>
          <option value="">All Payment</option>
          <option value="unpaid">Unpaid</option>
          <option value="part_paid">Part Paid</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <div className="filter-group">
        <label>From:</label>
        <input type="date" name="start_date" value={filters.start_date} onChange={onFilterChange} />
      </div>
      <div className="filter-group">
        <label>To:</label>
        <input type="date" name="end_date" value={filters.end_date} onChange={onFilterChange} />
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
              <td colSpan="10" className="empty-state">No purchase orders found</td>
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
                      <button className="action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}>
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
  </section>
);

const PurchasePaymentsSection = ({
  filters,
  distributors,
  onFilterChange,
  onOpenLedgerForm,
  ledgerBalanceSummary,
  payables,
  onOpenPayable,
  ledgerLoading,
  ledgerRecords,
  getLedgerRowStatusClass,
  getDistributorName,
  getLedgerTypeLabel,
  formatCurrency,
  toNumber,
  getEntryDisplayBalance,
  getLedgerBillNumber,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-section-header">
      <div>
        <h2>Payments & Ledger</h2>
        <p>Track payable orders, register payments, and review distributor balance movement.</p>
      </div>
      <div className="action-buttons">
        <button className="admin-btn primary" onClick={onOpenLedgerForm}>
          <Plus size={18} /> New Ledger Entry
        </button>
      </div>
    </div>

    <div className="filters-bar compact">
      <div className="filter-group">
        <label>Distributor:</label>
        <select name="distributor_id" value={filters.distributor_id} onChange={onFilterChange}>
          <option value="">All Distributors</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
    </div>

    <div className="purchase-payables-shell">
      <div className="ledger-balance-summary">
        <span className="ledger-balance-label">{ledgerBalanceSummary.label}</span>
        <strong className={`ledger-balance-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
          {formatCurrency(ledgerBalanceSummary.value)}
        </strong>
      </div>
      <div className="purchase-payables-grid">
        {(payables || []).slice(0, 8).map((entry) => (
          <div key={`payments-payable-${entry.order_id}`} className="purchase-payable-card">
            <strong>{entry.distributor_name}</strong>
            <span>{entry.po_number}</span>
            <small>{entry.payment_due_date}{entry.overdue_days ? ` | ${entry.overdue_days} day overdue` : ''}</small>
            <div className="purchase-payable-card-foot">
              <b>{formatCurrency(toNumber(entry.balance_due))}</b>
              <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                Pay
              </button>
            </div>
          </div>
        ))}
        {!(payables || []).length ? <div className="purchase-ops-empty">No payable items due right now.</div> : null}
      </div>
    </div>

    <div className="actions-bar ledger-header">
      <h2>Distributor Credit / Payment Ledger</h2>
    </div>
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Distributor</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Balance</th>
            <th>Mode</th>
            <th>Reference</th>
            <th>Bill No</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {ledgerLoading ? (
            <tr>
              <td colSpan="9" className="empty-state">Loading ledger records...</td>
            </tr>
          ) : ledgerRecords.length === 0 ? (
            <tr>
              <td colSpan="9" className="empty-state">No distributor payment/credit records found</td>
            </tr>
          ) : (
            ledgerRecords.map((entry, index) => (
              <tr key={entry.id || index} className={getLedgerRowStatusClass(entry)}>
                <td data-label="Date">{new Date(entry.created_at || entry.transaction_date || Date.now()).toLocaleDateString()}</td>
                <td data-label="Distributor">{getDistributorName(entry)}</td>
                <td data-label="Type">{getLedgerTypeLabel(entry)}</td>
                <td data-label="Amount">{formatCurrency(toNumber(entry.amount))}</td>
                <td data-label="Balance">{getEntryDisplayBalance(entry) === null ? '-' : formatCurrency(getEntryDisplayBalance(entry))}</td>
                <td data-label="Mode">{entry.payment_mode || entry.method || '-'}</td>
                <td data-label="Reference">{entry.reference || entry.po_number || '-'}</td>
                <td data-label="Bill No">{getLedgerBillNumber(entry)}</td>
                <td data-label="Description">{entry.description || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);

const PurchaseRemindersSection = ({
  operationsLoading,
  operationsSummary,
  onDraftDistributor,
  onOpenOrder,
  formatCurrency,
  toNumber,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-section-header">
      <div>
        <h2>Reminders & Workflow</h2>
        <p>Monitor tomorrow reminders, urgent next actions, and distributor pattern suggestions.</p>
      </div>
      {operationsLoading ? <span className="purchase-ops-loading">Refreshing...</span> : null}
    </div>

    <div className="purchase-ops-grid">
      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <BellRing size={16} />
          <span>Tomorrow Reminders</span>
        </div>
        {operationsSummary.reminders?.length ? (
          operationsSummary.reminders.map((entry) => (
            <div key={`reminders-full-${entry.distributor_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>{entry.message}</p>
                <small>{entry.schedule_day} | {entry.reminder_for}</small>
              </div>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.suggested_next_order_date,
                  suggested_items: entry.suggested_items || [],
                })}
              >
                Draft PO
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No distributor reminder due for tomorrow.</div>
        )}
      </section>

      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Clock size={16} />
          <span>Urgent Workflow</span>
        </div>
        {operationsSummary.workflow?.length ? (
          operationsSummary.workflow.map((entry) => (
            <div key={`reminders-workflow-${entry.order_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.po_number}</strong>
                <p>{entry.distributor_name}</p>
                <small>{entry.next_action}</small>
              </div>
              <button type="button" className="admin-btn secondary small" onClick={() => onOpenOrder(entry.order_id)}>
                Open
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No urgent workflow items.</div>
        )}
      </section>

      <section className="purchase-ops-panel insights">
        <div className="purchase-ops-panel-title">
          <Sparkles size={16} />
          <span>Distributor Insights</span>
        </div>
        {operationsSummary.distributor_insights?.length ? (
          operationsSummary.distributor_insights.map((entry) => (
            <div key={`reminders-insight-${entry.distributor_id}`} className="purchase-insight-card">
              <strong>{entry.distributor_name}</strong>
              <span>Next order: {entry.next_order_date || '-'}</span>
              <span>Cadence: {entry.cadence_days ? `${entry.cadence_days} days` : '-'}</span>
              <span>Outstanding: {formatCurrency(toNumber(entry.outstanding_amount))}</span>
              <small>{(entry.likely_items || []).slice(0, 3).join(', ') || 'No strong pattern yet'}</small>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.next_order_date,
                  suggested_items: entry.suggested_items || [],
                })}
              >
                Smart Draft
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">Not enough history for distributor insights yet.</div>
        )}
      </section>
    </div>
  </section>
);

const PurchaseReturnsSection = ({
  filters,
  distributors,
  onFilterChange,
  onOpenReturn,
  purchaseReturns,
  formatCurrency,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-section-header">
      <div>
        <h2>Purchase Returns</h2>
        <p>Review supplier returns and exchanges separately from active purchase orders.</p>
      </div>
      <div className="action-buttons">
        <button className="admin-btn primary" onClick={onOpenReturn}>
          <RotateCcw size={18} /> New Return / Exchange
        </button>
      </div>
    </div>

    <div className="filters-bar compact">
      <div className="filter-group">
        <label>Distributor:</label>
        <select name="distributor_id" value={filters.distributor_id} onChange={onFilterChange}>
          <option value="">All Distributors</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
    </div>

    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>Return Number</th>
            <th>Distributor</th>
            <th>Type</th>
            <th>Items</th>
            <th>Total</th>
            <th>Reason</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {purchaseReturns.length === 0 ? (
            <tr>
              <td colSpan="7" className="empty-state">No purchase returns found</td>
            </tr>
          ) : (
            purchaseReturns.map((ret) => (
              <tr key={ret.id}>
                <td data-label="Return Number"><strong>{ret.return_number}</strong></td>
                <td data-label="Distributor">{ret.distributor_name}</td>
                <td data-label="Type">
                  <span className={`type-badge ${ret.return_type}`}>
                    {ret.return_type === 'exchange' ? 'Exchange' : 'Return'}
                  </span>
                </td>
                <td data-label="Items">{ret.items?.length || 0}</td>
                <td data-label="Total">{formatCurrency(ret.total)}</td>
                <td data-label="Reason">{ret.reason || '-'}</td>
                <td data-label="Date">{new Date(ret.created_at).toLocaleDateString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);

export {
  PurchaseDashboardSection,
  PurchaseOrdersSection,
  PurchasePaymentsSection,
  PurchaseRemindersSection,
  PurchaseReturnsSection,
  PurchaseSectionTabs,
};
