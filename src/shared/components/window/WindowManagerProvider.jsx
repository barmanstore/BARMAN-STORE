import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Square, X } from 'lucide-react';
import useInertBackground from '../../hooks/useInertBackground';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';

const WindowManagerContext = createContext(null);
const WINDOW_BACKDROP_BACKGROUND = 'radial-gradient(circle at top, rgba(15, 23, 42, 0.18), transparent 55%), rgba(15, 23, 42, 0.34)';

const sortByOrder = (left, right) => Number(left.order || 0) - Number(right.order || 0);
const getTopVisibleWindowId = (list = []) =>
  list
    .filter((entry) => !entry.minimized)
    .sort(sortByOrder)
    .at(-1)?.id || null;

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

      const existing = current[index];
      const hasChanges = Object.entries(payload).some(([key, value]) => existing[key] !== value);
      if (!hasChanges) {
        return current;
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
    setActiveWindowId((currentId) => (currentId === id ? currentId : id));
    setWindows((current) => {
      if (getTopVisibleWindowId(current) === id) {
        return current;
      }

      let changed = false;
      const next = current.map((entry) => {
        if (entry.id !== id) return entry;
        changed = true;
        return { ...entry, order: orderRef.current++ };
      });

      return changed ? next : current;
    });
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
  useLockBodyScroll(hasVisibleWindows);

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
            className="window-manager-backdrop fixed inset-0 z-[3500] backdrop-blur-[3px] motion-reduce:backdrop-blur-none"
            onClick={handleBackdropClick}
            aria-hidden="true"
            style={{ background: WINDOW_BACKDROP_BACKGROUND }}
          />
        ) : null}
        {minimizedWindows.length ? (
          <div
            className="window-manager-dock fixed left-1/2 z-[3595] flex max-w-[min(92vw,960px)] -translate-x-1/2 flex-wrap gap-[0.6rem] rounded-[18px] border border-[rgba(148,163,184,0.34)] bg-white/[0.88] px-3 py-[0.55rem] shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-[14px] motion-reduce:backdrop-blur-none"
            aria-label="Minimized windows"
            style={{ bottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
          >
            {minimizedWindows.map((entry) => (
              <div
                key={entry.id}
                className="window-manager-dock-item inline-flex min-w-0 items-center gap-[0.4rem]"
              >
                <button
                  type="button"
                  className="window-manager-dock-button inline-flex min-w-0 max-w-[240px] items-center gap-[0.45rem] rounded-xl border border-[var(--color-border)] bg-slate-50/[0.96] px-[0.7rem] py-[0.45rem] text-[0.85rem] font-semibold text-[var(--color-primary)]"
                  onClick={() => setWindowMinimized(entry.id, false)}
                >
                  <Square size={14} />
                  <span className="truncate whitespace-nowrap">{entry.title || 'Window'}</span>
                </button>
                {typeof entry.onClose === 'function' ? (
                  <button
                    type="button"
                    className="window-manager-dock-close inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-slate-50/[0.96] text-[var(--color-primary)]"
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
