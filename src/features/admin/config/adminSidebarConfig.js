import { TrendingUp, ShoppingCart, Gift, BarChart2, Package, FolderOpen, FileText, Eye, ShoppingBag, Truck, History, Users, CreditCard } from 'lucide-react';

const filterSections = (sections, predicate) => (
  sections
    .map((section) => ({
      ...section,
      items: section.items.filter(predicate),
    }))
    .filter((section) => section.items.length > 0)
);

export const MOBILE_ALLOWED_TABS = new Set([
  'dashboard',
  'orders',
  'products',
  'billing',
  'users',
  'credit-khata',
  'customer-requests',
]);

export const SIDEBAR_SECTIONS = [
  {
    key: 'general',
    label: 'General',
    icon: TrendingUp,
    items: [
      { tab: 'dashboard', label: 'Dashboard', icon: TrendingUp, mobile: true },
      { tab: 'orders', label: 'Orders', icon: ShoppingCart, mobile: true },
      { tab: 'offers', label: 'Offers', icon: Gift, mobile: false },
      { tab: 'credit-aging', label: 'Credit Aging', icon: BarChart2, mobile: false },
    ],
  },
  {
    key: 'products',
    label: 'Products',
    icon: Package,
    items: [
      { tab: 'products', label: 'Products', icon: Package, mobile: true },
      { tab: 'categories', label: 'Categories', icon: FolderOpen, sub: true, mobile: false },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: FileText,
    items: [
      { tab: 'billing', label: 'Billing', icon: FileText, mobile: true },
      { tab: 'daily-sales', label: 'Daily Sales', icon: BarChart2, sub: true, mobile: false },
      { tab: 'view-bills', label: 'Bills History', icon: Eye, sub: true, mobile: false },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    icon: ShoppingBag,
    items: [
      { tab: 'purchases', label: 'Purchases', icon: ShoppingBag, mobile: false },
      { tab: 'distributors', label: 'Distributors', icon: Truck, sub: true, mobile: false },
      { tab: 'stock-ledger', label: 'Stock History', icon: History, sub: true, mobile: false },
      { tab: 'product-insights', label: 'Product Insights', icon: BarChart2, sub: true, mobile: false },
      { tab: 'distributor-insights', label: 'Distributor Insights', icon: TrendingUp, sub: true, mobile: false },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    icon: Users,
    items: [
      { tab: 'users', label: 'Users', icon: Users, mobile: true },
      { tab: 'credit-khata', label: 'Credit Khata', icon: CreditCard, sub: true, mobile: true },
      { tab: 'customer-requests', label: 'Customer Requests', icon: FileText, sub: true, mobile: true },
    ],
  },
];

export const MOBILE_SIDEBAR_SECTIONS = filterSections(SIDEBAR_SECTIONS, (item) => item.mobile);

export const ADMIN_DEFAULT_TAB = 'dashboard';

export const ALL_ADMIN_TABS = Array.from(new Set(
  SIDEBAR_SECTIONS.flatMap((section) => section.items.map((item) => item.tab))
));

const ADMIN_TAB_SET = new Set(ALL_ADMIN_TABS);

export const isKnownAdminTab = (tab) => ADMIN_TAB_SET.has(String(tab || '').trim());

export const normalizeAdminTab = (tab) => {
  const value = String(tab || '').trim();
  return isKnownAdminTab(value) ? value : ADMIN_DEFAULT_TAB;
};

export const getAdminTabHref = (tab = ADMIN_DEFAULT_TAB) => `/admin/${normalizeAdminTab(tab)}`;
