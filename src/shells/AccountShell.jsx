import { useEffect, useRef } from 'react';
import MobileAccountHeader from '../shared/components/mobile/MobileAccountHeader';
import MobileFooter from '../shared/components/mobile/MobileFooter';

function AccountShell({ children }) {
  const headerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const node = headerRef.current;
    if (!node) return undefined;

    const updateHeaderHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height || 0);
      document.documentElement.style.setProperty(
        '--app-header-height',
        `${Math.max(0, nextHeight)}px`
      );
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    let resizeObserver;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => updateHeaderHeight());
      resizeObserver.observe(node);
    }

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="app app-account-shell" data-window-background-root="true">
      <MobileAccountHeader headerRef={headerRef} />
      <main className="main-content main-content-account">{children}</main>
      <MobileFooter />
    </div>
  );
}

export default AccountShell;
