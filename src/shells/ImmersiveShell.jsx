import { useEffect } from 'react';

function ImmersiveShell({ children }) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.documentElement.style.setProperty('--app-header-height', '0px');
    return () => {
      document.documentElement.style.setProperty('--app-header-height', '0px');
    };
  }, []);

  return (
    <div className="app app-immersive-shell" data-window-background-root="true">
      <main className="main-content main-content-immersive">
        {children}
      </main>
    </div>
  );
}

export default ImmersiveShell;
