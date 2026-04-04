import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { Maximize2, Minus, X } from 'lucide-react';
import { OverlayEntry } from '../../../providers/OverlayProvider';
import useIsMobile from '../../hooks/useIsMobile';
import useFocusTrap from '../../hooks/useFocusTrap';
import useWindowDragResize from '../../hooks/useWindowDragResize';
import { useWindowManager } from './WindowManagerProvider';

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function WindowModal({
  open,
  title,
  subtitle = '',
  onClose,
  windowId: providedWindowId = null,
  children,
  themeClassName = '',
  dialogClassName = '',
  headerClassName = '',
  contentClassName = '',
  closeButtonClassName = '',
  headerActions = null,
  dismissible = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  minimizable = true,
  maximizable = true,
  draggable = true,
  resizable = true,
  initialSize = { width: 720, height: 560 },
  minWidth = 420,
  minHeight = 280,
  fullscreen = false,
}) {
  const manager = useWindowManager();
  const windows = manager?.windows || [];
  const activeWindowId = manager?.activeWindowId || null;
  const upsertWindow = manager?.upsertWindow || null;
  const unregisterWindow = manager?.unregisterWindow || null;
  const activateWindow = manager?.activateWindow || null;
  const setWindowMinimized = manager?.setWindowMinimized || null;
  const isMobileViewport = useIsMobile();
  const desktopLike = !isMobileViewport;
  const reactId = useId();
  const windowId = useMemo(
    () => providedWindowId || `window-${String(reactId).replace(/[:]/g, '')}`,
    [providedWindowId, reactId]
  );
  const titleId = `${windowId}-title`;
  const subtitleId = `${windowId}-subtitle`;
  const onCloseRef = useRef(onClose);

  const entry = windows.find((candidate) => candidate.id === windowId) || null;
  const sortedVisibleWindows = windows
    .filter((candidate) => !candidate.minimized)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const isMinimized = Boolean(entry?.minimized);
  const activeVisibleWindowId = sortedVisibleWindows.some(
    (candidate) => candidate.id === activeWindowId
  )
    ? activeWindowId
    : null;
  const topVisibleWindowId = activeVisibleWindowId
    || sortedVisibleWindows[sortedVisibleWindows.length - 1]?.id
    || null;
  const isActive = !entry || !topVisibleWindowId ? true : topVisibleWindowId === windowId;
  const overlayZIndex = 3600 + Number(entry?.order || 0);
  const canHandleEscape = dismissible !== false && closeOnEscape !== false;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const {
    frameRef,
    isMaximized,
    windowStyle,
    handleDragStart,
    handleResizeStart,
    toggleMaximize,
  } = useWindowDragResize({
    open,
    active: open && !isMinimized,
    interactive: dismissible && !fullscreen,
    draggable: desktopLike && draggable && !fullscreen,
    resizable: desktopLike && resizable && !fullscreen,
    initialSize,
    minWidth,
    minHeight,
  });

  useFocusTrap(frameRef, open && !isMinimized);

  useEffect(() => {
    if (!open || !fullscreen) return undefined;

    const { body, documentElement } = document;
    const currentCount = Number(body.dataset.windowModalFullscreenLockCount || 0);
    const nextCount = currentCount + 1;
    body.dataset.windowModalFullscreenLockCount = String(nextCount);
    documentElement.classList.add('window-modal-body-locked');
    body.classList.add('window-modal-body-locked');

    return () => {
      const activeCount = Number(body.dataset.windowModalFullscreenLockCount || 0);
      const remainingCount = Math.max(0, activeCount - 1);
      if (remainingCount === 0) {
        delete body.dataset.windowModalFullscreenLockCount;
        documentElement.classList.remove('window-modal-body-locked');
        body.classList.remove('window-modal-body-locked');
        return;
      }
      body.dataset.windowModalFullscreenLockCount = String(remainingCount);
    };
  }, [fullscreen, open]);

  const handleClose = useCallback(() => {
    if (!dismissible) return;
    const closeHandler = onCloseRef.current;
    if (typeof closeHandler !== 'function') return;
    closeHandler();
  }, [dismissible]);

  useEffect(() => {
    if (!open || !upsertWindow || !unregisterWindow) return undefined;

    upsertWindow(windowId, {
      title,
      onClose: handleClose,
      dismissible,
      closeOnBackdrop,
      closeOnEscape,
      minimized: false,
    });

    return () => unregisterWindow(windowId);
  }, [
    closeOnBackdrop,
    closeOnEscape,
    dismissible,
    handleClose,
    open,
    title,
    unregisterWindow,
    upsertWindow,
    windowId,
  ]);

  useEffect(() => {
    if (!open || !upsertWindow) return;
    upsertWindow(windowId, {
      title,
      onClose: handleClose,
      dismissible,
      closeOnBackdrop,
      closeOnEscape,
    });
  }, [closeOnBackdrop, closeOnEscape, dismissible, handleClose, open, title, upsertWindow, windowId]);

  useEffect(() => {
    if (!open || !activateWindow) return;
    activateWindow(windowId);
  }, [activateWindow, open, windowId]);

  const handleMinimize = useCallback(() => {
    if (!dismissible || !setWindowMinimized) return;
    setWindowMinimized(windowId, true);
  }, [dismissible, setWindowMinimized, windowId]);

  const handleFrameMouseDown = useCallback(() => {
    activateWindow?.(windowId);
  }, [activateWindow, windowId]);

  const frameStyle = fullscreen
    ? {
        zIndex: 1,
        inset: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh',
        overflow: 'hidden',
      }
    : {
        ...windowStyle,
        zIndex: 1,
        maxWidth: isMaximized ? '100vw' : 'calc(100vw - 32px)',
        maxHeight: isMaximized ? '100vh' : 'calc(100vh - 32px)',
        overflow: 'hidden',
      };

  if (!open || isMinimized) return null;

  const frame = (
    <div
      className={`window-modal-root ${themeClassName}${fullscreen ? ' is-fullscreen' : ''}`.trim()}
      data-window-modal-root="true"
      style={{ zIndex: overlayZIndex }}
    >
      <div
        ref={frameRef}
        className={[
          'window-modal-frame',
          dialogClassName,
          isActive ? 'is-active' : 'is-inactive',
          !fullscreen && isMaximized ? 'is-maximized' : '',
          fullscreen ? 'is-fullscreen' : '',
        ].filter(Boolean).join(' ')}
        style={frameStyle}
        onMouseDown={handleFrameMouseDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <div
          className={['window-modal-header', headerClassName].filter(Boolean).join(' ')}
          onMouseDown={fullscreen ? undefined : handleDragStart}
          data-window-drag-handle={fullscreen ? undefined : 'true'}
        >
          <div className="window-modal-title-group">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>

          <div className="window-modal-toolbar" data-window-ignore-drag={fullscreen ? undefined : 'true'}>
            {headerActions}
            <div className="window-modal-controls">
              {desktopLike && minimizable ? (
                <button
                  type="button"
                  className="window-modal-control-btn"
                  onClick={handleMinimize}
                  disabled={!dismissible}
                  aria-label="Minimize window"
                  title="Minimize"
                >
                  <Minus size={16} />
                </button>
              ) : null}
              {desktopLike && maximizable ? (
                <button
                  type="button"
                  className="window-modal-control-btn"
                  onClick={toggleMaximize}
                  disabled={!dismissible}
                  aria-label={isMaximized ? 'Restore window size' : 'Maximize window'}
                  title={isMaximized ? 'Restore' : 'Maximize'}
                >
                  <Maximize2 size={15} />
                </button>
              ) : null}
              <button
                type="button"
                className={['window-modal-control-btn', 'window-modal-close-btn', closeButtonClassName].filter(Boolean).join(' ')}
                onClick={handleClose}
                disabled={!dismissible}
                aria-label="Close window"
                title="Close"
                data-modal-close="true"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className={['window-modal-body', contentClassName].filter(Boolean).join(' ')}>
          {children}
        </div>

        {desktopLike && resizable && dismissible && !isMaximized ? (
          <>
            {RESIZE_DIRECTIONS.map((direction) => (
              <div
                key={direction}
                className={`window-modal-resize-handle window-modal-resize-${direction}`}
                onMouseDown={(event) => handleResizeStart(event, direction)}
                aria-hidden="true"
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <OverlayEntry
      active={open && !isMinimized}
      id={`window-modal-${windowId}`}
      type="overlay"
      zIndex={overlayZIndex}
      onEscape={canHandleEscape ? handleClose : null}
    >
      {frame}
    </OverlayEntry>
  );
}

export default WindowModal;
