import { BrowserRouter } from 'react-router-dom';
import RootShell from './RootShell';
import { CartProvider } from './providers/CartProvider';
import { NotificationsProvider } from './providers/NotificationsProvider';
import { OverlayProvider } from './providers/OverlayProvider';
import { RoutePolicyProvider } from './providers/RoutePolicyProvider';
import { SessionProvider } from './providers/SessionProvider';
import ErrorBoundary from './shared/components/ErrorBoundary';
import { WindowManagerProvider } from './shared/components/window/WindowManagerProvider';
import './index.css';
import './App.css';

const routerBasename = (() => {
  const base = String(import.meta.env.BASE_URL || '/');
  return base === '/' ? '/' : base.replace(/\/$/, '');
})();

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter
        basename={routerBasename}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <RoutePolicyProvider>
          <SessionProvider>
            <CartProvider>
              <NotificationsProvider>
                <OverlayProvider>
                  <WindowManagerProvider>
                    <RootShell />
                  </WindowManagerProvider>
                </OverlayProvider>
              </NotificationsProvider>
            </CartProvider>
          </SessionProvider>
        </RoutePolicyProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
