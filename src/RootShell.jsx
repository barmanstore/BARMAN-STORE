import { Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppRoutes } from './app/appRoutes';
import { useCart } from './providers/CartProvider';
import { useNotifications } from './providers/NotificationsProvider';
import { useRoutePolicy } from './providers/RoutePolicyProvider';
import { useSession } from './providers/SessionProvider';
import BackofficePopupGuard from './shared/components/backoffice/BackofficePopupGuard';
import GlobalAdminShortcuts from './shared/components/runtime/GlobalAdminShortcuts';
import VisitorTracker from './shared/components/runtime/VisitorTracker';
import AccountShell from './shells/AccountShell';
import DefaultShell from './shells/DefaultShell';
import ImmersiveShell from './shells/ImmersiveShell';
import NoShell from './shells/NoShell';
import * as info from './shared/info.js';

const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

const ROUTE_SHELL_CLASSNAMES = [
  'app-shell-variant-default',
  'app-shell-variant-account',
  'app-shell-variant-immersive',
  'app-shell-variant-none',
];

function RootShell() {
  const location = useLocation();
  const routePolicy = useRoutePolicy();
  const { user, setUser, isAdminUser } = useSession();
  const { cartCount } = useCart();
  const notificationProps = useNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const logoImage = getPublicFileUrl(info.LOGO_URL || 'logo.png');
  const callHref = `tel:${String(info.CONTACT || '').replace(/[^\d+]/g, '')}`;
  const whatsappDigits = String(info.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const whatsappText = encodeURIComponent(
    String(info.WHATSAPP_DEFAULT_TEXT || 'Hello Barman Store, I need help with my order.')
  );
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${whatsappText}`
    : '';

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search, routePolicy.variant]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const variantClassName = `app-shell-variant-${routePolicy.variant}`;
    ROUTE_SHELL_CLASSNAMES.forEach((className) => document.body.classList.remove(className));
    document.body.classList.add(variantClassName);
    return () => {
      document.body.classList.remove(variantClassName);
    };
  }, [routePolicy.variant]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof document === 'undefined') return;
    if (document.querySelector('[data-window-background-root="true"]')) return;
    throw new Error('RootShell expected an active shell root with data-window-background-root="true".');
  }, [routePolicy.variant]);

  const routesElement = useMemo(() => (
    <Suspense
      fallback={(
        <div className="route-loading" role="status" aria-live="polite">
          <span className="route-loading__spinner" aria-hidden="true" />
          <span className="route-loading__text">
            {routePolicy.variant === 'none' ? 'Loading workspace...' : 'Loading Barman Store...'}
          </span>
        </div>
      )}
    >
      <AppRoutes />
    </Suspense>
  ), [routePolicy.variant]);

  let shell = null;
  if (routePolicy.variant === 'account') {
    shell = <AccountShell>{routesElement}</AccountShell>;
  } else if (routePolicy.variant === 'immersive') {
    shell = <ImmersiveShell>{routesElement}</ImmersiveShell>;
  } else if (routePolicy.variant === 'none') {
    shell = <NoShell>{routesElement}</NoShell>;
  } else {
    shell = (
      <DefaultShell
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        logoImage={logoImage}
        cartCount={cartCount}
        user={user}
        setUser={setUser}
        isAdminUser={isAdminUser}
        notificationProps={notificationProps}
        callHref={callHref}
        whatsappHref={whatsappHref}
        publicFileUrl={getPublicFileUrl}
      >
        {routesElement}
      </DefaultShell>
    );
  }

  return (
    <>
      <GlobalAdminShortcuts />
      {routePolicy.sideEffects.analytics ? <VisitorTracker /> : null}
      <BackofficePopupGuard />
      {shell}
    </>
  );
}

export default RootShell;
