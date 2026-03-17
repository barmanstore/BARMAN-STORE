const useAdminDataLoaders = ({
  statsApi,
  productsApi,
  ordersApi,
  usersApi,
  adminApi,
  billingApi,
  setStats,
  setProducts,
  setOrders,
  setUsers,
  setVisitorStats,
  setBills,
  setDailySalesLoading,
  setDailySalesError,
  setLoading,
  showNotification,
  asNumber,
}) => {
  const refreshAdminData = async () => {
    const [statsData, productsData, ordersData, usersData, analyticsData] = await Promise.all([
      statsApi.orders(),
      productsApi.getAll({ include_inactive: true }),
      ordersApi.getAll(),
      usersApi.getAll(),
      adminApi.getAnalyticsSummary(),
    ]);

    setStats(statsData);
    setProducts(productsData);
    setOrders(ordersData);
    setUsers(usersData);
    setVisitorStats({
      onlineVisitors: asNumber(analyticsData?.online_visitors, 0),
      onlineLoggedInUsers: asNumber(analyticsData?.online_logged_in_users, 0),
      uniqueSessionsToday: asNumber(analyticsData?.unique_sessions_today, 0),
      uniqueSessionsMonth: asNumber(analyticsData?.unique_sessions_month, 0),
      uniqueSessionsYear: asNumber(analyticsData?.unique_sessions_year, 0),
    });
  };

  const loadDailySalesBills = async ({ silent = false } = {}) => {
    try {
      if (!silent) setDailySalesLoading(true);
      setDailySalesError('');
      const rows = await billingApi.getAll();
      setBills(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (!silent) setDailySalesError(error.message || 'Failed to load bills for daily summary');
    } finally {
      if (!silent) setDailySalesLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      await refreshAdminData();
    } catch (error) {
      console.error('Error fetching data:', error);
      showNotification(error.message || 'Failed to load admin dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  return {
    refreshAdminData,
    loadDailySalesBills,
    fetchData,
  };
};

export default useAdminDataLoaders;
