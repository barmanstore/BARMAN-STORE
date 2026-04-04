import { useEffect, useMemo } from 'react';
import { ADMIN_DEFAULT_TAB, getAdminTabHref, isKnownAdminTab, normalizeAdminTab } from '../config/adminSidebarConfig';

const useAdminNavigation = ({
  activeTab,
  setActiveTab,
  isMobile,
  routeTab,
  navigate,
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
    'restock-dashboard': 'products',
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
    const requestedTab = String(routeTab || '').trim();
    if (!requestedTab) return;
    if (!isKnownAdminTab(requestedTab)) {
      navigate(getAdminTabHref(ADMIN_DEFAULT_TAB), { replace: true });
      return;
    }
    const nextTab = isMobile && !MOBILE_ALLOWED_TABS.has(requestedTab)
      ? ADMIN_DEFAULT_TAB
      : requestedTab;
    if (nextTab !== requestedTab) {
      navigate(getAdminTabHref(nextTab), { replace: true });
      return;
    }
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [routeTab, activeTab, isMobile, setActiveTab, navigate, MOBILE_ALLOWED_TABS]);

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
    const normalizedTab = normalizeAdminTab(tab);
    const nextTab = isTabAllowed(normalizedTab) ? normalizedTab : ADMIN_DEFAULT_TAB;
    setActiveTab(nextTab);
    navigate(getAdminTabHref(nextTab));
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
