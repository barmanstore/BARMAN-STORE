import { useMemo } from 'react';
import { projectPurchaseOrderDraft } from '../utils/orderDrafts';

const usePurchaseManagementDerived = ({
  showOrderForm,
  orderFormData,
  products,
  distributors,
  ledgerRecords,
  filters,
  orderDetail,
  calculateOrderItem,
  calculateOrderTotals,
  findProductForItem,
  getLedgerBalanceSummary,
  getDistributorProductOptions,
  getDistributorHistoryProducts,
  getOrderDistributorInfo,
  isPoEditable,
  getStatusBadge,
  getPoLifecycleStatus,
  getPoPaymentBadge,
  getPoPaymentStatus,
  getLedgerRowStatusClass,
  normalizePoPaymentStatus,
  toNumber,
}) => {
  const orderDraftProjection = useMemo(() => projectPurchaseOrderDraft({
    items: showOrderForm ? orderFormData.items : [],
    products,
    findProductForItem,
    calculateOrderItem,
    calculateOrderTotals,
    previousProjection: null,
  }), [
    showOrderForm,
    orderFormData.items,
    products,
    findProductForItem,
    calculateOrderItem,
    calculateOrderTotals,
  ]);
  const orderTotals = orderDraftProjection.totals;
  const ledgerBalanceSummary = getLedgerBalanceSummary(ledgerRecords, filters.distributor_id);

  const orderDetailSupplier = getOrderDistributorInfo(orderDetail, distributors);
  const orderDetailIsEditable = orderDetail ? isPoEditable(orderDetail) : false;
  const orderProductOptions = useMemo(
    () => getDistributorProductOptions(orderFormData.distributor_id),
    [orderFormData.distributor_id, getDistributorProductOptions]
  );
  const supplierHistoryItems = useMemo(
    () => getDistributorHistoryProducts(orderFormData.distributor_id),
    [getDistributorHistoryProducts, orderFormData.distributor_id]
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
    if (entry?.supplier_name) return entry.supplier_name;
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
    orderDetailSupplier,
    orderDetailIsEditable,
    orderProductOptions,
    supplierHistoryItems,
    lowStockProducts,
    getStatusBadgeForOrder,
    getPoPaymentBadgeForOrder,
    getLedgerRowStatusClassForEntry,
    getDistributorName,
    getLedgerBillNumber,
  };
};

export default usePurchaseManagementDerived;
