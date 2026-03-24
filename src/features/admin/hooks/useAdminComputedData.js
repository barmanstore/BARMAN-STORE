import { useMemo } from 'react';

const useAdminComputedData = ({
  products,
  users,
  orders,
  recentOrdersPreview,
  recentCustomersPreview,
  bills,
  dailySalesDate,
  toLocalDateKey,
  asNumber,
  getCategoryPath,
}) => {
  const productCategories = useMemo(() => {
    return Array.from(
      new Set(products.map((product) => getCategoryPath(product)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [products, getCategoryPath]);

  const activeProductsCount = useMemo(
    () => products.filter((product) => Number(product?.is_active ?? 1) === 1).length,
    [products]
  );

  const inactiveProductsCount = Math.max(0, products.length - activeProductsCount);

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

  const lowStockProducts = useMemo(
    () => products
      .filter((product) => Number(product?.is_active ?? 1) === 1 && asNumber(product?.stock, 0) <= 10)
      .sort((a, b) => asNumber(a?.stock, 0) - asNumber(b?.stock, 0))
      .slice(0, 3),
    [products, asNumber]
  );

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
      ...totals,
      txCount,
      expectedDrawerCash: totals.cashCollected,
      avgTicket: txCount > 0 ? totals.totalBilled / txCount : 0,
    };
  }, [selectedSalesBills, asNumber]);

  return {
    productCategories,
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
    selectedSalesBills,
    dailySalesSummary,
  };
};

export default useAdminComputedData;
