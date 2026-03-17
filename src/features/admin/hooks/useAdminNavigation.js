import { useEffect, useMemo } from 'react';

const useAdminNavigation = ({
  activeTab,
  setActiveTab,
  isMobile,
  searchParams,
  setSearchParams,
  MOBILE_ALLOWED_TABS,
  SIDEBAR_SECTIONS,
  MOBILE_SIDEBAR_SECTIONS,
  setExpandedGroups,
  desktopActiveGroup,
  setDesktopActiveGroup,
  desktopPanelCollapsed,
  setDesktopPanelCollapsed,
  setIsMobileSidebarOpen,
}) => {
  const tabGroupMap = useMemo(() => ({
    dashboard: 'general',
    orders: 'general',
    offers: 'general',
    'credit-aging': 'general',
    products: 'products',
    categories: 'products',
    billing: 'billing',
    'daily-sales': 'billing',
    'view-bills': 'billing',
    purchases: 'purchase',
    distributors: 'purchase',
    'stock-ledger': 'purchase',
    'product-insights': 'purchase',
    'distributor-insights': 'purchase',
    users: 'users',
    'credit-khata': 'users',
    'customer-requests': 'users'
  }), []);

  useEffect(() => {
    const group = tabGroupMap[activeTab];
    if (!group) return;
    setExpandedGroups(prev => ({ ...prev, [group]: true }));
    setDesktopActiveGroup(group);
  }, [activeTab, setExpandedGroups, setDesktopActiveGroup, tabGroupMap]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (!tabFromUrl || !tabGroupMap[tabFromUrl]) return;
    const nextTab = isMobile && !MOBILE_ALLOWED_TABS.has(tabFromUrl)
      ? 'dashboard'
      : tabFromUrl;
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [searchParams, activeTab, isMobile, setActiveTab, tabGroupMap, MOBILE_ALLOWED_TABS]);

  useEffect(() => {
    if (!isMobile) return;
    if (MOBILE_ALLOWED_TABS.has(activeTab)) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'dashboard');
    setSearchParams(next, { replace: true });
    setActiveTab('dashboard');
  }, [activeTab, isMobile, searchParams, setSearchParams, setActiveTab, MOBILE_ALLOWED_TABS]);

  const toggleSidebarGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleDesktopGroupSelect = (groupKey) => {
    setDesktopActiveGroup(groupKey);
    if (desktopPanelCollapsed) {
      setDesktopPanelCollapsed(false);
    }
  };

  const isTabAllowed = (tab) => !isMobile || MOBILE_ALLOWED_TABS.has(tab);

  const handleTabChange = (tab) => {
    const nextTab = isTabAllowed(tab) ? tab : 'dashboard';
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
    if (isMobile) {
      setIsMobileSidebarOpen(false);
    }
  };

  const desktopCurrentSection = useMemo(
    () => SIDEBAR_SECTIONS.find((section) => section.key === desktopActiveGroup) || SIDEBAR_SECTIONS[0],
    [SIDEBAR_SECTIONS, desktopActiveGroup]
  );

  return {
    desktopCurrentSection,
    mobileSidebarSections: MOBILE_SIDEBAR_SECTIONS,
    toggleSidebarGroup,
    handleDesktopGroupSelect,
    handleTabChange,
  };
};

export default useAdminNavigation;
