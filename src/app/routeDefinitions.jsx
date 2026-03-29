import { lazy } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ADMIN_DEFAULT_TAB, getAdminTabHref, normalizeAdminTab } from '../features/admin/config/adminSidebarConfig';

const Home = lazy(() => import('../features/storefront/Home'));
const ProductsPage = lazy(() => import('../features/catalog/products/pages/ProductsPage'));
const Cart = lazy(() => import('../features/cart/Cart'));
const Checkout = lazy(() => import('../features/checkout/Checkout'));
const Login = lazy(() => import('../features/auth/Login'));
const AdminPage = lazy(() => import('../features/admin/pages/AdminPage'));
const BillingPopupPage = lazy(() => import('../features/sales/billing/pages/BillingPopupPage'));
const PurchasePopupPage = lazy(() => import('../features/commerce/purchase/pages/PurchasePopupPage'));
const CreditHistory = lazy(() => import('../features/credits/history/CreditHistory'));
const OrderHistoryPage = lazy(() => import('../features/orders/pages/OrderHistoryPage'));
const OrderTrackingPage = lazy(() => import('../features/orders/pages/OrderTrackingPage'));
const OrderDetailsPage = lazy(() => import('../features/orders/pages/OrderDetailsPage'));
const Profile = lazy(() => import('../features/auth/Profile'));
const MyBills = lazy(() => import('../features/sales/billing/MyBills'));
const ProductRecommendations = lazy(() => import('../features/storefront/ProductRecommendations'));
const StoreInfo = lazy(() => import('../features/storefront/StoreInfo'));
const StorePage = lazy(() => import('../features/storefront/StorePage'));

const buildPolicy = ({
  desktop = 'default',
  mobile = desktop,
  analytics = true,
  notifications = true,
  allowAdminShortcuts = true,
  isPopupRoute = false,
  isAdminArea = false,
} = {}) => ({
  shell: { desktop, mobile },
  sideEffects: {
    analytics,
    notifications,
  },
  runtime: {
    allowAdminShortcuts,
    isPopupRoute,
    isAdminArea,
  },
});

const defaultPolicy = buildPolicy();
const accountMobilePolicy = buildPolicy({ desktop: 'default', mobile: 'account' });
const immersiveProductsPolicy = buildPolicy({ desktop: 'default', mobile: 'immersive' });
const popupPolicy = buildPolicy({
  desktop: 'none',
  mobile: 'none',
  analytics: false,
  notifications: false,
  allowAdminShortcuts: false,
  isPopupRoute: true,
});
const adminPolicy = buildPolicy({ isAdminArea: true });

function AdminRedirectRoute() {
  const location = useLocation();
  const next = new URLSearchParams(location.search || '');
  const nextTab = normalizeAdminTab(next.get('tab') || ADMIN_DEFAULT_TAB);
  next.delete('tab');
  const nextSearch = next.toString();
  const target = `${getAdminTabHref(nextTab)}${nextSearch ? `?${nextSearch}` : ''}`;
  return <Navigate to={target} replace />;
}

function MyOrdersRedirectRoute() {
  return <Navigate to="/order-history" replace />;
}

export const APP_ROUTE_DEFINITIONS = [
  { key: 'home', path: '/', component: Home, policy: defaultPolicy },
  { key: 'products', path: '/products', component: ProductsPage, policy: immersiveProductsPolicy },
  { key: 'cart', path: '/cart', component: Cart, policy: accountMobilePolicy },
  { key: 'checkout', path: '/checkout', component: Checkout, policy: accountMobilePolicy },
  { key: 'login', path: '/login', component: Login, policy: accountMobilePolicy },
  { key: 'admin-redirect', path: '/admin', component: AdminRedirectRoute, policy: adminPolicy },
  { key: 'billing-popup', path: '/popup/billing', component: BillingPopupPage, policy: popupPolicy },
  { key: 'purchase-popup', path: '/popup/purchase', component: PurchasePopupPage, policy: popupPolicy },
  { key: 'admin-user-credit', path: '/admin/users/:userId/credit', component: CreditHistory, policy: adminPolicy },
  { key: 'admin-tab', path: '/admin/:tab', component: AdminPage, policy: adminPolicy },
  { key: 'my-credit', path: '/my-credit', component: CreditHistory, policy: accountMobilePolicy },
  { key: 'order-history', path: '/order-history', component: OrderHistoryPage, policy: accountMobilePolicy },
  { key: 'my-orders', path: '/my-orders', component: MyOrdersRedirectRoute, policy: accountMobilePolicy },
  { key: 'order-details', path: '/orders/:id', component: OrderDetailsPage, policy: accountMobilePolicy },
  { key: 'order-tracking', path: '/order-tracking', component: OrderTrackingPage, policy: accountMobilePolicy },
  { key: 'order-tracking-id', path: '/order-tracking/:orderId', component: OrderTrackingPage, policy: accountMobilePolicy },
  { key: 'profile', path: '/profile', component: Profile, policy: accountMobilePolicy },
  { key: 'my-bills', path: '/my-bills', component: MyBills, policy: accountMobilePolicy },
  { key: 'product-requests', path: '/product-requests', component: ProductRecommendations, policy: accountMobilePolicy },
  { key: 'store-info', path: '/store-info', component: StoreInfo, policy: accountMobilePolicy },
  { key: 'store', path: '/store', component: StorePage, policy: accountMobilePolicy },
];

export const DEFAULT_ROUTE_POLICY = {
  key: 'fallback',
  path: '*',
  policy: defaultPolicy,
};
