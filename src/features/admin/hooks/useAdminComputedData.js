import { useMemo } from 'react';
import { buildCashSummary } from '../utils/dailyCashSummary';

const useAdminComputedData = ({
  products,
  productCategories,
  productSummary,
  productInsights,
  users,
  orders,
  recentOrdersPreview,
  recentCustomersPreview,
  bills,
  dailySalesDate,
  dailyCashTally,
  toLocalDateKey,
  asNumber,
  getCategoryPath,
}) => {
  const resolvedProductCategories = useMemo(() => {
    if (Array.isArray(productCategories) && productCategories.length > 0) {
      return productCategories.slice().sort((a, b) => a.localeCompare(b));
    }
    return Array.from(
      new Set(products.map((product) => getCategoryPath(product)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [productCategories, products, getCategoryPath]);

  const activeProductsCount = useMemo(() => {
    if (Number.isFinite(Number(productSummary?.activeCount))) {
      return Number(productSummary.activeCount || 0);
    }
    return products.filter((product) => Number(product?.is_active ?? 1) === 1).length;
  }, [productSummary, products]);

  const inactiveProductsCount = useMemo(() => {
    if (Number.isFinite(Number(productSummary?.inactiveCount))) {
      return Math.max(0, Number(productSummary.inactiveCount || 0));
    }
    return Math.max(0, products.length - activeProductsCount);
  }, [productSummary, products.length, activeProductsCount]);

  const customerUsers = useMemo(
    () => users.filter((user) => String(user?.role || '').toLowerCase() !== 'admin'),
    [users]
  );

  const adminUsers = useMemo(
    () => users.filter((user) => String(user?.role || '').toLowerCase() === 'admin'),
    [users]
  );

  const filteredUsers = useMemo(() => {
    return {
      admins: adminUsers,
      customers: customerUsers,
    };
  }, [adminUsers, customerUsers]);

  const filteredUsersCount = filteredUsers.admins.length + filteredUsers.customers.length;

  const visibleOrders = useMemo(() => {
    return Array.isArray(orders) ? orders : [];
  }, [orders]);

  const recentOrders = useMemo(
    () => [...(Array.isArray(recentOrdersPreview) ? recentOrdersPreview : [])]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3),
    [recentOrdersPreview]
  );

  const lowStockProducts = useMemo(() => {
    if (Array.isArray(productSummary?.lowStockProducts) && productSummary.lowStockProducts.length > 0) {
      return productSummary.lowStockProducts.slice(0, 3);
    }
    return products
      .filter((product) => Number(product?.is_active ?? 1) === 1 && asNumber(product?.stock, 0) <= 10)
      .sort((a, b) => asNumber(a?.stock, 0) - asNumber(b?.stock, 0))
      .slice(0, 3);
  }, [productSummary, products, asNumber]);

  const recentCustomers = useMemo(
    () => [...(Array.isArray(recentCustomersPreview) ? recentCustomersPreview : [])]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3),
    [recentCustomersPreview]
  );

  const selectedDateKey = String(dailySalesDate || '').trim() || toLocalDateKey(new Date());

  const selectedSalesBills = useMemo(
    () => (Array.isArray(bills) ? bills : [])
      .filter((bill) => String(bill?.bill_type || 'sales').trim().toLowerCase() === 'sales')
      .filter((bill) => toLocalDateKey(bill?.created_at) === selectedDateKey)
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()),
    [bills, selectedDateKey, toLocalDateKey]
  );

  const selectedDailyCashTally = useMemo(() => {
    if (!dailyCashTally || typeof dailyCashTally !== 'object') return null;
    return String(dailyCashTally?.date || '').trim() === selectedDateKey ? dailyCashTally : null;
  }, [dailyCashTally, selectedDateKey]);

  const dailySalesSummary = useMemo(() => {
    const totals = selectedSalesBills.reduce((acc, bill) => {
      acc.totalBilled += asNumber(bill?.total_amount, 0);
      acc.cashCollected += asNumber(bill?.paid_amount, 0);
      acc.creditIssued += asNumber(bill?.credit_amount, 0);
      if (String(bill?.payment_status || '').trim().toLowerCase() === 'paid') {
        acc.paidBills += 1;
      } else {
        acc.pendingBills += 1;
      }
      return acc;
    }, {
      totalBilled: 0,
      cashCollected: 0,
      creditIssued: 0,
      paidBills: 0,
      pendingBills: 0,
    });
    const txCount = selectedSalesBills.length;
    return {
      ...buildCashSummary({
        totalBilled: totals.totalBilled,
        cashCollected: totals.cashCollected,
        creditIssued: totals.creditIssued,
        paidBills: totals.paidBills,
        pendingBills: totals.pendingBills,
        txCount,
        hasManualCashTally: Boolean(selectedDailyCashTally),
        manualCashTally: selectedDailyCashTally?.countedCashTotal ?? 0,
        cashTallyUpdatedAt: selectedDailyCashTally?.updatedAt || selectedDailyCashTally?.createdAt || '',
        cashTallyUpdatedByName: selectedDailyCashTally?.updatedByName || '',
      }),
      cashTallyNote: String(selectedDailyCashTally?.note || '').trim(),
    };
  }, [selectedSalesBills, asNumber, selectedDailyCashTally]);

  const topSellingProducts = useMemo(() => {
    const rows = Array.isArray(productInsights) ? productInsights : [];
    return rows
      .filter((row) => Number(row?.purchase_count || 0) > 0)
      .slice()
      .sort((a, b) => Number(b?.purchase_count || 0) - Number(a?.purchase_count || 0))
      .slice(0, 5);
  }, [productInsights]);

  const slowMovingProducts = useMemo(() => {
    const rows = Array.isArray(productInsights) ? productInsights : [];
    return rows
      .filter((row) => Number(row?.purchase_count || 0) > 0)
      .slice()
      .sort((a, b) => Number(b?.avg_days_between || 0) - Number(a?.avg_days_between || 0))
      .slice(0, 5);
  }, [productInsights]);

  return {
    productCategories: resolvedProductCategories,
    activeProductsCount,
    inactiveProductsCount,
    customerUsers,
    adminUsers,
    filteredUsers,
    filteredUsersCount,
    visibleOrders,
    recentOrders,
    lowStockProducts,
    recentCustomers,
    selectedDateKey,
    dailyCashTally: selectedDailyCashTally,
    selectedSalesBills,
    dailySalesSummary,
    topSellingProducts,
    slowMovingProducts,
  };
};

export default useAdminComputedData;
