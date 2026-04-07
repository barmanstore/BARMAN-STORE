import { Link } from 'react-router-dom';
import { Package, ShoppingCart, Users, TrendingUp, CreditCard, Wallet, Clock, Truck } from 'lucide-react';
import SignedCurrency from '../../../shared/components/SignedCurrency';
import { formatCurrency, truncateUserName } from '../../../shared/utils/formatters';
import { asNumber } from '../utils/adminHelpers';

const normalizeId = (value) => String(value ?? '').trim();

const matchesSupplierScheduleEntry = (entry, distributorId, supplierId) => {
  if (!entry) return false;
  const normalizedSupplierId = normalizeId(supplierId);
  if (normalizedSupplierId) {
    return normalizeId(entry?.supplier_id) === normalizedSupplierId;
  }
  return normalizeId(entry?.distributor_id) === normalizeId(distributorId);
};

const toShortDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString();
};

const takeSuggestedItemNames = (items = [], limit = 4) => (
  (Array.isArray(items) ? items : [])
    .map((item) => String(item?.product_name || item?.name || '').trim())
    .filter(Boolean)
    .slice(0, limit)
);

const isReviewableWorkflowEntry = (entry) => {
  const status = String(entry?.po_status || '').trim().toLowerCase();
  const nextAction = String(entry?.next_action || '').trim().toLowerCase();
  return (
    status === 'prepared'
    || status === 'sent'
    || status === 'revised'
    || nextAction.includes('confirm')
    || nextAction.includes('bill')
  );
};

const MobileOwnerTaskCard = ({
  icon: Icon,
  label,
  value,
  title,
  meta,
  actionLabel,
  onAction,
}) => (
  <article className="dashboard-owner-task">
    <div className="dashboard-owner-task-icon" aria-hidden="true">
      <Icon size={18} />
    </div>
    <div className="dashboard-owner-task-body">
      <div className="dashboard-owner-task-top">
        <div>
          <p className="dashboard-owner-task-label">{label}</p>
          <h3 className="dashboard-owner-task-title">{title}</h3>
        </div>
        <span className="dashboard-owner-task-value">{value}</span>
      </div>
      <p className="dashboard-owner-task-meta">{meta}</p>
      <button type="button" className="admin-btn secondary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  </article>
);

function DashboardSection({
  dashboardDensity,
  setDashboardDensity,
  isMobile,
  stats,
  todayCashSummary,
  creditAgingSummary,
  purchaseOpsSummary,
  topSellingProducts,
  slowMovingProducts,
  pendingOrdersCount,
  activeProductsCount,
  inactiveProductsCount,
  lowStockProducts,
  products,
  totalCustomers,
  visitorStats,
  recentOrders,
  recentCustomers,
  onTabChange,
  onOpenPurchaseOrder,
}) {
  const todayDistributors = Array.isArray(purchaseOpsSummary?.todayDistributors)
    ? purchaseOpsSummary.todayDistributors
    : [];
  const tomorrowDistributors = Array.isArray(purchaseOpsSummary?.tomorrowDistributors)
    ? purchaseOpsSummary.tomorrowDistributors
    : [];
  const weeklyDistributors = Array.isArray(purchaseOpsSummary?.weeklyDistributors)
    ? purchaseOpsSummary.weeklyDistributors
    : [];
  const predictedDeliveries = Array.isArray(purchaseOpsSummary?.predictedDeliveriesNext)
    ? purchaseOpsSummary.predictedDeliveriesNext
    : [];
  const predictedPaymentsToday = Array.isArray(purchaseOpsSummary?.predictedPaymentsToday)
    ? purchaseOpsSummary.predictedPaymentsToday
    : [];
  const payables = Array.isArray(purchaseOpsSummary?.payables)
    ? purchaseOpsSummary.payables
    : [];
  const workflow = Array.isArray(purchaseOpsSummary?.workflow)
    ? purchaseOpsSummary.workflow
    : [];
  const reviewableWorkflow = workflow.filter((entry) => isReviewableWorkflowEntry(entry));
  const vendorOutstanding = Number(purchaseOpsSummary?.cards?.outstanding_amount || 0);
  const waitingDeliveryCount = Math.max(0, Number(purchaseOpsSummary?.cards?.waiting_delivery_count || 0));
  const waitingBillCount = Math.max(0, Number(purchaseOpsSummary?.cards?.waiting_bill_count || 0));
  const closeReadyCount = Math.max(0, Number(purchaseOpsSummary?.cards?.close_ready_count || 0));
  const nextDeliveryDate = predictedDeliveries[0]?.next_delivery_date || '';
  const totalOutstanding = Number(creditAgingSummary?.totalOutstanding || 0);
  const customersNeedFollowUp = Number(creditAgingSummary?.customersNeedFollowUp || 0);
  const customersOverdue = Number(creditAgingSummary?.customersOverdue || 0);
  const cashCollected = Number(todayCashSummary?.cashCollected || 0);
  const cashPicture = Number(todayCashSummary?.effectiveCashPicture || 0);
  const cashVariance = Number(todayCashSummary?.cashVariance || 0);
  const hasManualCashTally = Boolean(todayCashSummary?.hasManualCashTally);
  const creditIssued = Number(todayCashSummary?.creditIssued || 0);
  const primarySupplierContext = todayDistributors[0]
    ? { kind: 'today', entry: todayDistributors[0] }
    : tomorrowDistributors[0]
      ? { kind: 'tomorrow', entry: tomorrowDistributors[0] }
      : payables[0]
        ? { kind: 'payable', entry: payables[0] }
        : workflow[0]
          ? { kind: 'workflow', entry: workflow[0] }
          : weeklyDistributors[0]
            ? { kind: 'weekly', entry: weeklyDistributors[0] }
            : null;
  const selectedDistributorId = normalizeId(primarySupplierContext?.entry?.distributor_id);
  const selectedScheduleSupplierId = normalizeId(primarySupplierContext?.entry?.supplier_id);
  const matchingTodayEntry = todayDistributors.find(
    (entry) => matchesSupplierScheduleEntry(entry, selectedDistributorId, selectedScheduleSupplierId)
  ) || null;
  const matchingTomorrowEntry = tomorrowDistributors.find(
    (entry) => matchesSupplierScheduleEntry(entry, selectedDistributorId, selectedScheduleSupplierId)
  ) || null;
  const matchingWeeklyEntry = weeklyDistributors.find(
    (entry) => matchesSupplierScheduleEntry(entry, selectedDistributorId, selectedScheduleSupplierId)
  ) || null;
  const scheduleEntry = matchingTodayEntry || matchingTomorrowEntry || matchingWeeklyEntry || null;
  const payableTarget = payables.find((entry) => normalizeId(entry?.distributor_id) === selectedDistributorId)
    || workflow.find((entry) => normalizeId(entry?.distributor_id) === selectedDistributorId && Number(entry?.balance_due || 0) > 0)
    || null;
  const reviewTarget = selectedDistributorId
    ? (
      workflow.find(
        (entry) => normalizeId(entry?.distributor_id) === selectedDistributorId && isReviewableWorkflowEntry(entry)
      ) || null
    )
    : workflow.find((entry) => isReviewableWorkflowEntry(entry)) || null;
  const suggestedItemNames = takeSuggestedItemNames(scheduleEntry?.suggested_items || []);
  const supplierDisplayName = String(
    primarySupplierContext?.entry?.supplier_name
      || scheduleEntry?.supplier_name
      || primarySupplierContext?.entry?.distributor_name
      || scheduleEntry?.distributor_name
      || payableTarget?.distributor_name
      || reviewTarget?.distributor_name
      || ''
  ).trim();
  const supplierName = String(
    primarySupplierContext?.entry?.distributor_name
      || scheduleEntry?.distributor_name
      || payableTarget?.distributor_name
      || reviewTarget?.distributor_name
      || ''
  ).trim();
  const supplierSourceLabel = matchingTodayEntry
    ? `Today order day • ${toShortDate(matchingTodayEntry.schedule_date)}`
    : matchingTomorrowEntry
      ? `Tomorrow prep • ${toShortDate(matchingTomorrowEntry.schedule_date)}`
      : primarySupplierContext?.kind === 'payable'
        ? `Payment due • ${toShortDate(primarySupplierContext?.entry?.payment_due_date)}`
        : primarySupplierContext?.kind === 'workflow'
          ? `Open PO • ${primarySupplierContext?.entry?.next_action || '-'}`
          : matchingWeeklyEntry
            ? `Upcoming route • ${matchingWeeklyEntry.schedule_day || toShortDate(matchingWeeklyEntry.schedule_date)}`
            : 'No supplier priority yet';
  const supplierExpectedDate = scheduleEntry?.schedule_date
    || reviewTarget?.expected_delivery
    || '';
  const supplierDraftSupplierId = normalizeId(
    scheduleEntry?.supplier_id
      || primarySupplierContext?.entry?.supplier_id
  );
  const supplierDraftSupplierName = String(
    scheduleEntry?.supplier_name
      || primarySupplierContext?.entry?.supplier_name
      || ''
  ).trim();
  const supplierDueAmount = Number(
    payableTarget?.balance_due
      || scheduleEntry?.po_balance_due
      || scheduleEntry?.due_today_amount
      || 0
  );
  const supplierPoBalance = Number(scheduleEntry?.po_balance_due || payableTarget?.balance_due || 0);
  const supplierLedgerBalance = Number(scheduleEntry?.ledger_balance || 0);
  const supplierOverdueAmount = Number(scheduleEntry?.overdue_amount || 0);
  const supplierDueTodayAmount = Number(scheduleEntry?.due_today_amount || 0);
  const paymentFocusEntry = payables[0] || predictedPaymentsToday[0] || null;
  const paymentFocusAmount = Number(
    paymentFocusEntry?.balance_due
      || paymentFocusEntry?.predicted_payment_amount
      || 0
  );
  const reviewFocusEntry = reviewTarget || reviewableWorkflow[0] || workflow[0] || null;
  const deliveryFocusEntry = predictedDeliveries[0] || null;
  const ownerSummaryItems = [
    { key: 'visits', label: 'Visits', value: todayDistributors.length },
    { key: 'payments', label: 'Due', value: payables.length || predictedPaymentsToday.length },
    { key: 'drafts', label: 'Drafts', value: reviewableWorkflow.length || workflow.length },
    { key: 'deliveries', label: 'Waiting', value: waitingDeliveryCount || predictedDeliveries.length },
  ];

  const handlePrepareSupplierPo = () => {
    if (!selectedDistributorId) {
      onTabChange('purchases');
      return;
    }
    onOpenPurchaseOrder?.({
      action: 'create-draft',
      source: 'dashboard',
      distributorId: selectedDistributorId,
      distributorName: supplierName,
      supplierId: supplierDraftSupplierId,
      supplierName: supplierDraftSupplierName,
      plannedOrderDate: supplierExpectedDate,
      expectedDelivery: supplierExpectedDate,
      suggestedItems: Array.isArray(scheduleEntry?.suggested_items) ? scheduleEntry.suggested_items : [],
    });
  };

  const handleRecordSupplierPayment = () => {
    if (!payableTarget?.order_id) {
      onTabChange('purchases');
      return;
    }
    onOpenPurchaseOrder?.({
      action: 'open-payment',
      source: 'dashboard',
      orderId: payableTarget.order_id,
      distributorId: selectedDistributorId,
      distributorName: supplierName,
    });
  };

  const handleOpenPaymentFocus = () => {
    if (!paymentFocusEntry?.order_id) {
      onTabChange('purchases');
      return;
    }
    onOpenPurchaseOrder?.({
      action: 'open-payment',
      source: 'dashboard-mobile',
      orderId: paymentFocusEntry.order_id,
      distributorId: normalizeId(paymentFocusEntry.distributor_id),
      distributorName: paymentFocusEntry.distributor_name,
    });
  };

  const handleReviewSupplierOrder = () => {
    if (!reviewTarget?.order_id) {
      onTabChange('purchases');
      return;
    }
    onOpenPurchaseOrder?.({
      action: 'open-order',
      source: 'dashboard',
      orderId: reviewTarget.order_id,
      distributorId: selectedDistributorId,
      distributorName: supplierName,
    });
  };

  const handleOpenReviewFocus = () => {
    if (!reviewFocusEntry?.order_id) {
      onTabChange('purchases');
      return;
    }
    onOpenPurchaseOrder?.({
      action: 'open-order',
      source: 'dashboard-mobile',
      orderId: reviewFocusEntry.order_id,
      distributorId: normalizeId(reviewFocusEntry.distributor_id),
      distributorName: reviewFocusEntry.distributor_name,
    });
  };

  const ownerTaskCards = [
    {
      key: 'supplier',
      icon: Package,
      label: 'Supplier visits',
      value: todayDistributors.length
        ? `${todayDistributors.length} today`
        : tomorrowDistributors.length
          ? `${tomorrowDistributors.length} tomorrow`
          : weeklyDistributors.length
            ? `${weeklyDistributors.length} next`
            : 'Clear',
      title: supplierDisplayName || 'No supplier visit queued',
      meta: primarySupplierContext
        ? supplierSourceLabel
        : 'Open purchases to review supplier schedules and next prep.',
      actionLabel: selectedDistributorId ? 'Prepare PO' : 'View plan',
      onAction: handlePrepareSupplierPo,
    },
    {
      key: 'payments',
      icon: Wallet,
      label: 'Due payments',
      value: payables.length
        ? `${payables.length} due`
        : predictedPaymentsToday.length
          ? `${predictedPaymentsToday.length} today`
          : 'Clear',
      title: paymentFocusEntry?.distributor_name || 'No payment due right now',
      meta: paymentFocusEntry
        ? `${formatCurrency(paymentFocusAmount)} | ${toShortDate(
          paymentFocusEntry.payment_due_date
            || paymentFocusEntry.next_payment_due_date
            || paymentFocusEntry.inferred_due_date
        )}`
        : 'Open purchases to review payables and predicted payments.',
      actionLabel: paymentFocusEntry?.order_id ? 'Record Payment' : 'View dues',
      onAction: handleOpenPaymentFocus,
    },
    {
      key: 'drafts',
      icon: Clock,
      label: 'Draft POs',
      value: reviewableWorkflow.length
        ? `${reviewableWorkflow.length} ready`
        : workflow.length
          ? `${workflow.length} open`
          : 'Clear',
      title: reviewFocusEntry?.po_number || 'No PO waiting for review',
      meta: reviewFocusEntry
        ? `${reviewFocusEntry.distributor_name || 'Supplier'} | ${reviewFocusEntry.next_action || 'Review purchase order'}`
        : `Bills waiting: ${waitingBillCount} | Close ready: ${closeReadyCount}`,
      actionLabel: reviewFocusEntry?.order_id ? 'Review PO' : 'Open workflow',
      onAction: handleOpenReviewFocus,
    },
    {
      key: 'deliveries',
      icon: Truck,
      label: 'Pending deliveries',
      value: waitingDeliveryCount
        ? `${waitingDeliveryCount} waiting`
        : predictedDeliveries.length
          ? `${predictedDeliveries.length} next`
          : 'Clear',
      title: deliveryFocusEntry?.distributor_name || 'No delivery follow-up now',
      meta: deliveryFocusEntry
        ? `ETA ${toShortDate(deliveryFocusEntry.next_delivery_date)} | ${Math.max(0, Number(deliveryFocusEntry.active_open_orders || 0))} open order${Number(deliveryFocusEntry.active_open_orders || 0) === 1 ? '' : 's'}`
        : 'Open purchases to check receive flow and expected deliveries.',
      actionLabel: 'Check deliveries',
      onAction: () => onTabChange('purchases'),
    },
  ];

  return (
    <div className={`dashboard dashboard-${dashboardDensity}`}>
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        {!isMobile && (
          <div className="dashboard-density-toggle" role="group" aria-label="Dashboard density">
            <button
              type="button"
              className={`dashboard-density-btn ${dashboardDensity === 'compact' ? 'active' : ''}`}
              onClick={() => setDashboardDensity('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`dashboard-density-btn ${dashboardDensity === 'standard' ? 'active' : ''}`}
              onClick={() => setDashboardDensity('standard')}
            >
              Standard
            </button>
          </div>
        )}
      </div>
      {isMobile ? (
        <section className="dashboard-owner-mobile" aria-label="Owner quick tasks">
          <div className="dashboard-owner-mobile-head">
            <p className="dashboard-owner-mobile-kicker">Owner Quick View</p>
            <h2>Phone follow-up</h2>
            <p className="dashboard-owner-mobile-copy">
              Supplier, payment, draft, and delivery work stays one tap away.
            </p>
          </div>
          <div className="dashboard-owner-mobile-summary">
            {ownerSummaryItems.map((item) => (
              <div key={item.key} className="dashboard-owner-pill">
                <span className="dashboard-owner-pill-label">{item.label}</span>
                <strong className="dashboard-owner-pill-value">{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="dashboard-owner-mobile-tasks">
            {ownerTaskCards.map((task) => (
              <MobileOwnerTaskCard
                key={task.key}
                icon={task.icon}
                label={task.label}
                value={task.value}
                title={task.title}
                meta={task.meta}
                actionLabel={task.actionLabel}
                onAction={task.onAction}
              />
            ))}
          </div>
          <div className="dashboard-owner-mobile-actions">
            <button type="button" className="admin-btn secondary" onClick={() => onTabChange('purchases')}>
              Purchases
            </button>
            <button type="button" className="admin-btn secondary" onClick={() => onTabChange('daily-sales')}>
              Daily Cash
            </button>
            <button type="button" className="admin-btn secondary" onClick={() => onTabChange('orders')}>
              Orders
            </button>
          </div>
        </section>
      ) : null}
      <div className="stats-grid grouped-stats-grid">
        <div className="stat-group-card">
          <div className="stat-group-head">
            <ShoppingCart size={28} />
            <div>
              <p className="stat-group-kicker">Sales Snapshot</p>
              <h3><SignedCurrency amount={stats.totalRevenue} /></h3>
              <p className="stat-group-main-label">Total Revenue</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Total Orders</span>
              <strong>{asNumber(stats.totalOrders, 0)}</strong>
            </div>
            <div className="stat-group-metric">
              <span>Ordered (Pending Receive)</span>
              <strong>{pendingOrdersCount}</strong>
            </div>
          </div>
        </div>

        <div className="stat-group-card">
          <div className="stat-group-head">
            <Package size={28} />
            <div>
              <p className="stat-group-kicker">Catalog Health</p>
              <h3>{activeProductsCount}</h3>
              <p className="stat-group-main-label">Active Products</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Inactive Products</span>
              <strong>{inactiveProductsCount}</strong>
            </div>
            <div className="stat-group-metric">
              <span>Low Stock (≤10)</span>
              <strong>{lowStockProducts.length}</strong>
            </div>
            <div className="stat-group-metric">
              <span>Total Products</span>
              <strong>{products.length}</strong>
            </div>
          </div>
        </div>

        <div className="stat-group-card">
          <div className="stat-group-head">
            <Users size={28} />
            <div>
              <p className="stat-group-kicker">Customer Status</p>
              <h3>{totalCustomers}</h3>
              <p className="stat-group-main-label">Total Customers</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Online Logged-In</span>
              <strong>{visitorStats.onlineLoggedInUsers}</strong>
            </div>
          </div>
        </div>

        <div className="stat-group-card">
          <div className="stat-group-head">
            <TrendingUp size={28} />
            <div>
              <p className="stat-group-kicker">Visitor Traffic</p>
              <h3>{visitorStats.onlineVisitors}</h3>
              <p className="stat-group-main-label">Online Visitors</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Unique Today</span>
              <strong>{visitorStats.uniqueSessionsToday}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Today Focus</h3>
          </div>
          <div className="dashboard-list">
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Customers needing follow‑up</span>
              <strong className="dashboard-row-value">{customersNeedFollowUp}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Customers overdue</span>
              <strong className="dashboard-row-value">{customersOverdue}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Outstanding credit</span>
              <strong className="dashboard-row-value">{formatCurrency(totalOutstanding)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Low stock items</span>
              <strong className="dashboard-row-value">{lowStockProducts.length}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Pending orders</span>
              <strong className="dashboard-row-value">{pendingOrdersCount}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Distributors today</span>
              <strong className="dashboard-row-value">{todayDistributors.length}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Next delivery</span>
              <strong className="dashboard-row-value">
                {nextDeliveryDate ? new Date(nextDeliveryDate).toLocaleDateString() : '-'}
              </strong>
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn" onClick={() => onTabChange('credit-aging')}>View Credit Aging</button>
            <button className="admin-btn" onClick={() => onTabChange('orders')}>View Orders</button>
            <button className="admin-btn" onClick={() => onTabChange('products')}>View Low Stock</button>
            <button className="admin-btn" onClick={() => onTabChange('purchases')}>View Purchases</button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Store Analytics (Today)</h3>
          </div>
          <div className="dashboard-list">
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Cash picture</span>
              <span className="dashboard-row-secondary">
                {hasManualCashTally
                  ? `Manual tally ${formatCurrency(cashPicture)} vs billed ${formatCurrency(cashCollected)}`
                  : `Bill-derived until a tally is saved. Billed ${formatCurrency(cashCollected)}`}
              </span>
              <strong className="dashboard-row-value">{formatCurrency(cashPicture)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Udhar given</span>
              <strong className="dashboard-row-value">{formatCurrency(creditIssued)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Cash delta vs billed</span>
              <strong className="dashboard-row-value">{formatCurrency(cashVariance)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Vendor dues</span>
              <strong className="dashboard-row-value">{formatCurrency(vendorOutstanding)}</strong>
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn" onClick={() => onTabChange('daily-sales')}>View Daily Sales</button>
            <button className="admin-btn" onClick={() => onTabChange('purchases')}>View Vendor Dues</button>
          </div>
          <div className="dashboard-panel-sublist">
            <div>
              <p className="dashboard-subhead">Top items</p>
              {Array.isArray(topSellingProducts) && topSellingProducts.length ? (
                topSellingProducts.map((item) => (
                  <div key={`top-${item.product_id}`} className="dashboard-list-row">
                    <span className="dashboard-row-primary">{item.product_name}</span>
                    <span className="dashboard-row-value">{Math.max(0, Number(item.purchase_count || 0))} buys</span>
                  </div>
                ))
              ) : (
                <p className="dashboard-empty">No top items yet.</p>
              )}
            </div>
            <div>
              <p className="dashboard-subhead">Slow moving</p>
              {Array.isArray(slowMovingProducts) && slowMovingProducts.length ? (
                slowMovingProducts.map((item) => (
                  <div key={`slow-${item.product_id}`} className="dashboard-list-row">
                    <span className="dashboard-row-primary">{item.product_name}</span>
                    <span className="dashboard-row-value">
                      {Number(item.avg_days_between || 0) > 0 ? `${Number(item.avg_days_between).toFixed(1)}d` : '-'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="dashboard-empty">No slow items yet.</p>
              )}
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn secondary" onClick={() => onTabChange('product-insights')}>
              View Product Insights
            </button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Supplier Visit Prep</h3>
          </div>
          {!primarySupplierContext ? (
            <p className="dashboard-empty">No supplier visit, payable, or draft PO is queued yet.</p>
          ) : (
            <>
              <div className="dashboard-list">
                <div className="dashboard-list-row">
                  <span className="dashboard-row-primary">{supplierDisplayName || 'Supplier'}</span>
                  <span className="dashboard-row-secondary">{supplierSourceLabel}</span>
                  <strong className="dashboard-row-value">{formatCurrency(supplierDueAmount)}</strong>
                </div>
                <div className="dashboard-list-row">
                  <span className="dashboard-row-primary">PO / ledger due</span>
                  <span className="dashboard-row-secondary">
                    PO {formatCurrency(supplierPoBalance)} | Ledger {formatCurrency(supplierLedgerBalance)}
                  </span>
                  <strong className="dashboard-row-value">
                    {supplierOverdueAmount > 0
                      ? `${formatCurrency(supplierOverdueAmount)} overdue`
                      : formatCurrency(supplierDueTodayAmount)}
                  </strong>
                </div>
                <div className="dashboard-list-row">
                  <span className="dashboard-row-primary">Suggested short items</span>
                  <span className="dashboard-row-secondary">
                    {suggestedItemNames.length
                      ? suggestedItemNames.join(', ')
                      : 'No short-item suggestion learned for this supplier yet.'}
                  </span>
                  <strong className="dashboard-row-value">
                    {suggestedItemNames.length ? `${suggestedItemNames.length} item${suggestedItemNames.length === 1 ? '' : 's'}` : '-'}
                  </strong>
                </div>
                <div className="dashboard-list-row">
                  <span className="dashboard-row-primary">Review state</span>
                  <span className="dashboard-row-secondary">
                    {reviewTarget?.po_number
                      ? `${reviewTarget.po_number} • ${reviewTarget.next_action || 'Review purchase order'}`
                      : 'No draft PO is ready for final review yet.'}
                  </span>
                  <strong className="dashboard-row-value">
                    {reviewTarget?.balance_due ? formatCurrency(reviewTarget.balance_due) : '-'}
                  </strong>
                </div>
              </div>
              <div className="dashboard-actions">
                <button className="admin-btn" onClick={handlePrepareSupplierPo}>
                  Prepare PO
                </button>
                <button
                  className="admin-btn"
                  onClick={handleRecordSupplierPayment}
                  disabled={!payableTarget?.order_id}
                >
                  Record Payment
                </button>
                <button
                  className="admin-btn"
                  onClick={handleReviewSupplierOrder}
                  disabled={!reviewTarget?.order_id}
                >
                  Review &amp; Send
                </button>
              </div>
            </>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Quick Actions</h3>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn" onClick={() => onTabChange('orders')}>Manage Orders</button>
            <button className="admin-btn" onClick={() => onTabChange('products')}>Manage Products</button>
            <button className="admin-btn" onClick={() => onTabChange('billing')}>Create Bill</button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Low Stock (≤ 10)</h3>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="dashboard-empty">No low stock products.</p>
          ) : (
            <div className="dashboard-list">
              {lowStockProducts.map((product) => (
                <div className="dashboard-list-row" key={product.id}>
                  <span className="dashboard-row-primary">{product.name}</span>
                  <strong className="dashboard-row-value">Stock: {asNumber(product.stock, 0)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Recent Orders</h3>
          </div>
          {recentOrders.length === 0 ? (
            <p className="dashboard-empty">No orders yet.</p>
          ) : (
            <div className="dashboard-list">
              {recentOrders.map((order) => (
                <div className="dashboard-list-row" key={order.id}>
                  <span className="dashboard-row-primary">{order.order_number || `#${order.id}`}</span>
                  <span className="dashboard-row-secondary">
                    Date: {new Date(order.created_at || Date.now()).toLocaleDateString()}
                  </span>
                  <span className="dashboard-row-value">{formatCurrency(order.total_amount || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Recent Customers</h3>
          </div>
          {recentCustomers.length === 0 ? (
            <p className="dashboard-empty">No customers found.</p>
          ) : (
            <div className="dashboard-list">
              {recentCustomers.map((customer) => (
                <div className="dashboard-list-row" key={customer.id}>
                  <span className="dashboard-row-primary">{truncateUserName(customer.name || '-', 15)}</span>
                  <span className="dashboard-row-secondary">{customer.phone || customer.email || '-'}</span>
                  <Link
                    className="action-btn credit"
                    to={`/admin/users/${customer.id}/credit?returnTab=dashboard`}
                    title="Open credit history"
                  >
                    <CreditCard size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardSection;

