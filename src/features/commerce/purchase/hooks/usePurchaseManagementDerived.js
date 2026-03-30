import { useMemo, useRef } from 'react';
import { projectPurchaseOrderDraft } from '../utils/orderDrafts';

const usePurchaseManagementDerived = ({
  showOrderForm,
  orderFormData,
  purchaseOrders,
  products,
  distributors,
  operationsSummary,
  ledgerRecords,
  filters,
  orderDetail,
  calculateOrderItem,
  calculateOrderTotals,
  findProductForItem,
  getLedgerBalanceSummary,
  getDistributorProductOptions,
  getOrderDistributorInfo,
  isPoEditable,
  getStatusBadge,
  getPoLifecycleStatus,
  getPoPaymentBadge,
  getPoPaymentStatus,
  getLedgerRowStatusClass,
  normalizePoPaymentStatus,
  formatCurrency,
  toNumber,
  icons,
}) => {
  const previousProjectionRef = useRef(null);
  const orderDraftProjection = useMemo(() => projectPurchaseOrderDraft({
    items: showOrderForm ? orderFormData.items : [],
    products,
    findProductForItem,
    calculateOrderItem,
    calculateOrderTotals,
    previousProjection: previousProjectionRef.current,
  }), [
    showOrderForm,
    orderFormData.items,
    products,
    findProductForItem,
    calculateOrderItem,
    calculateOrderTotals,
  ]);
  previousProjectionRef.current = orderDraftProjection;
  const orderTotals = orderDraftProjection.totals;
  const ledgerBalanceSummary = getLedgerBalanceSummary(ledgerRecords, filters.distributor_id);
  const operationsCards = operationsSummary?.cards || {};
  const operationsCardItems = [
    {
      key: 'payable_today',
      label: 'Pay Today',
      value: formatCurrency(toNumber(operationsCards.payable_today_amount)),
      meta: `${toNumber(operationsCards.today_distributor_count)} order-day distributors`,
      tone: 'warning',
      icon: icons?.Wallet,
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      value: formatCurrency(toNumber(operationsCards.outstanding_amount)),
      meta: `${toNumber(operationsCards.tomorrow_distributor_count)} tomorrow prep`,
      tone: 'default',
      icon: icons?.DollarSign,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: formatCurrency(toNumber(operationsCards.overdue_amount)),
      meta: `${toNumber(operationsCards.weekly_distributor_count)} in weekly plan`,
      tone: 'danger',
      icon: icons?.AlertTriangle,
    },
    {
      key: 'predicted_today',
      label: 'Predicted Today',
      value: formatCurrency(toNumber(operationsCards.predicted_payment_today_amount)),
      meta: `${toNumber(operationsCards.close_ready_count)} ready to close`,
      tone: 'success',
      icon: icons?.CheckCheck,
    },
    {
      key: 'next_payment',
      label: 'Next Payment',
      value: operationsCards.next_payment_due_date || '-',
      meta: `${toNumber(operationsCards.predicted_payment_next_count)} predicted`,
      tone: 'default',
      icon: icons?.Clock,
    },
    {
      key: 'next_delivery',
      label: 'Next Delivery',
      value: operationsCards.next_delivery_date || '-',
      meta: `${toNumber(operationsCards.predicted_delivery_next_count)} predicted`,
      tone: 'default',
      icon: icons?.Truck,
    },
  ];

  const orderDetailSupplier = getOrderDistributorInfo(orderDetail, distributors);
  const orderDetailIsEditable = orderDetail ? isPoEditable(orderDetail) : false;
  const orderProductOptions = useMemo(
    () => getDistributorProductOptions(orderFormData.distributor_id),
    [orderFormData.distributor_id, purchaseOrders, products, getDistributorProductOptions]
  );

  const lowStockProducts = useMemo(() => {
    const threshold = 10;
    return (Array.isArray(products) ? products : [])
      .filter((product) => {
        if (product?.is_active === false || Number(product?.is_active || 0) === 0) return false;
        return toNumber(product?.stock) <= threshold;
      })
      .sort((a, b) => toNumber(a?.stock) - toNumber(b?.stock))
      .slice(0, 8);
  }, [products, toNumber]);

  const getStatusBadgeForOrder = (order) => getStatusBadge(order, getPoLifecycleStatus);
  const getPoPaymentBadgeForOrder = (order) => getPoPaymentBadge(order, getPoPaymentStatus);
  const getLedgerRowStatusClassForEntry = (entry) => getLedgerRowStatusClass(entry, normalizePoPaymentStatus);

  const getDistributorName = (entry) => {
    if (entry?.distributor_name) return entry.distributor_name;
    const distributorId = entry?.distributor_id;
    if (!distributorId) return '-';
    const distributor = distributors.find((d) => String(d.id) === String(distributorId));
    return distributor?.name || '-';
  };

  const getLedgerBillNumber = (entry) => (
    entry?.bill_number || entry?.linked_bill_number || entry?.po_bill_number || entry?.invoice_number || entry?.po_invoice_number || '-'
  );

  return {
    orderDraftProjection,
    orderTotals,
    ledgerBalanceSummary,
    operationsCardItems,
    orderDetailSupplier,
    orderDetailIsEditable,
    orderProductOptions,
    lowStockProducts,
    getStatusBadgeForOrder,
    getPoPaymentBadgeForOrder,
    getLedgerRowStatusClassForEntry,
    getDistributorName,
    getLedgerBillNumber,
  };
};

export default usePurchaseManagementDerived;
