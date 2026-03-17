import { useMemo } from 'react';

const useAdminComputedData = ({
  products,
  users,
  orders,
  bills,
  usersSearchQuery,
  ordersSearchQuery,
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
    const query = String(usersSearchQuery || '').trim().toLowerCase();
    const matchesQuery = (entry) => {
      if (!query) return true;
      const searchable = [
        entry?.id,
        entry?.name,
        entry?.email,
        entry?.phone,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return searchable.includes(query);
    };
    return {
      admins: adminUsers.filter(matchesQuery),
      customers: customerUsers.filter(matchesQuery),
    };
  }, [adminUsers, customerUsers, usersSearchQuery]);

  const filteredUsersCount = filteredUsers.admins.length + filteredUsers.customers.length;

  const visibleOrders = useMemo(() => {
    const query = String(ordersSearchQuery || '').trim().toLowerCase();
    const list = Array.isArray(orders) ? [...orders] : [];

    const sorted = list.sort(
      (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );

    if (!query) return sorted;

    return sorted.filter((order) => {
      const searchable = [
        order?.id,
        order?.order_number,
        order?.customer_name,
        order?.customer_email,
        order?.status,
        order?.total_amount,
        order?.bill_id,
        order?.linked_bill_number,
        order?.created_at,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return searchable.includes(query);
    });
  }, [orders, ordersSearchQuery]);

  const pendingOrdersList = useMemo(
    () => orders.filter((order) => String(order?.status || '').toLowerCase() === 'ordered'),
    [orders]
  );

  const recentOrders = useMemo(
    () => [...orders]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3),
    [orders]
  );

  const lowStockProducts = useMemo(
    () => products
      .filter((product) => Number(product?.is_active ?? 1) === 1 && asNumber(product?.stock, 0) <= 10)
      .sort((a, b) => asNumber(a?.stock, 0) - asNumber(b?.stock, 0))
      .slice(0, 3),
    [products, asNumber]
  );

  const recentCustomers = useMemo(
    () => [...customerUsers]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3),
    [customerUsers]
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
    pendingOrdersList,
    recentOrders,
    lowStockProducts,
    recentCustomers,
    selectedDateKey,
    selectedSalesBills,
    dailySalesSummary,
  };
};

export default useAdminComputedData;
