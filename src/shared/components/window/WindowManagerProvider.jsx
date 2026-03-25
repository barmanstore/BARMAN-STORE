import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Square, X } from 'lucide-react';
import useInertBackground from '../../hooks/useInertBackground';
import './WindowModal.css';

const WindowManagerContext = createContext(null);

const sortByOrder = (left, right) => Number(left.order || 0) - Number(right.order || 0);

export function WindowManagerProvider({ children }) {
  const [windows, setWindows] = useState([]);
  const [activeWindowId, setActiveWindowId] = useState(null);
  const orderRef = useRef(1);

  const upsertWindow = useCallback((id, payload) => {
    setWindows((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      if (index === -1) {
        return [...current, { id, order: orderRef.current++, minimized: false, ...payload }];
      }

      const next = [...current];
      next[index] = { ...next[index], ...payload };
      return next;
    });
  }, []);

  const unregisterWindow = useCallback((id) => {
    setWindows((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const activateWindow = useCallback((id) => {
    setActiveWindowId(id);
    setWindows((current) =>
      current.map((entry) => (
        entry.id === id
          ? { ...entry, order: orderRef.current++ }
          : entry
      ))
    );
  }, []);

  const setWindowMinimized = useCallback((id, minimized) => {
    if (!minimized) {
      setActiveWindowId(id);
    }
    setWindows((current) =>
      current.map((entry) => (
        entry.id === id
          ? { ...entry, minimized, order: minimized ? entry.order : orderRef.current++ }
          : entry
      ))
    );
  }, []);

  useEffect(() => {
    const hasActiveVisibleWindow = windows.some(
      (entry) => entry.id === activeWindowId && !entry.minimized
    );
    if (hasActiveVisibleWindow) return;

    const nextActiveWindow = windows
      .filter((entry) => !entry.minimized)
      .sort(sortByOrder)
      .at(-1) || null;
    const nextActiveWindowId = nextActiveWindow?.id || null;

    if (nextActiveWindowId !== activeWindowId) {
      setActiveWindowId(nextActiveWindowId);
    }
  }, [activeWindowId, windows]);

  const visibleWindows = useMemo(
    () => windows.filter((entry) => !entry.minimized).sort(sortByOrder),
    [windows]
  );
  const minimizedWindows = useMemo(
    () => windows.filter((entry) => entry.minimized).sort(sortByOrder),
    [windows]
  );
  const topVisibleWindow = useMemo(() => {
    if (!visibleWindows.length) return null;
    return (
      visibleWindows.find((entry) => entry.id === activeWindowId)
      || visibleWindows[visibleWindows.length - 1]
    );
  }, [activeWindowId, visibleWindows]);
  const hasVisibleWindows = visibleWindows.length > 0;

  useInertBackground(hasVisibleWindows);

  useEffect(() => {
    if (!topVisibleWindow || typeof window === 'undefined') return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (topVisibleWindow.dismissible === false || topVisibleWindow.closeOnEscape === false) return;
      if (typeof topVisibleWindow.onClose !== 'function') return;
      event.preventDefault();
      topVisibleWindow.onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topVisibleWindow]);

  const contextValue = useMemo(() => ({
    windows,
    activeWindowId,
    upsertWindow,
    unregisterWindow,
    activateWindow,
    setWindowMinimized,
  }), [activateWindow, activeWindowId, setWindowMinimized, unregisterWindow, upsertWindow, windows]);

  const handleBackdropClick = () => {
    if (!topVisibleWindow || topVisibleWindow.dismissible === false || topVisibleWindow.closeOnBackdrop === false) return;
    if (typeof topVisibleWindow.onClose === 'function') {
      topVisibleWindow.onClose();
    }
  };

  const desktopLayer = typeof document === 'undefined'
    ? null
    : createPortal(
      <>
        {hasVisibleWindows ? (
          <div
            className="window-manager-backdrop"
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
        ) : null}
        {minimizedWindows.length ? (
          <div className="window-manager-dock" aria-label="Minimized windows">
            {minimizedWindows.map((entry) => (
              <div key={entry.id} className="window-manager-dock-item">
                <button
                  type="button"
                  className="window-manager-dock-button"
                  onClick={() => setWindowMinimized(entry.id, false)}
                >
                  <Square size={14} />
                  <span>{entry.title || 'Window'}</span>
                </button>
                {typeof entry.onClose === 'function' ? (
                  <button
                    type="button"
                    className="window-manager-dock-close"
                    onClick={() => entry.onClose()}
                    aria-label={`Close ${entry.title || 'window'}`}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </>,
      document.body
    );

  return (
    <WindowManagerContext.Provider value={contextValue}>
      {children}
      {desktopLayer}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  return useContext(WindowManagerContext);
}
