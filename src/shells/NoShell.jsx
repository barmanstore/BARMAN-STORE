import { useEffect } from 'react';

function NoShell({ children }) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.documentElement.style.setProperty('--app-header-height', '0px');
    return () => {
      document.documentElement.style.setProperty('--app-header-height', '0px');
    };
  }, []);

  return (
    <div className="app app-popup" data-window-background-root="true">
      <main className="main-content main-content-popup">{children}</main>
    </div>
  );
}

export default NoShell;
