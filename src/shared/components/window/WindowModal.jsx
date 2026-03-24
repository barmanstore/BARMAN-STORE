import { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minus, X } from 'lucide-react';
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
}) {
  const manager = useWindowManager();
  const isMobileViewport = useIsMobile();
  const desktopLike = !isMobileViewport;
  const reactId = useId();
  const windowId = useMemo(
    () => providedWindowId || `window-${String(reactId).replace(/[:]/g, '')}`,
    [providedWindowId, reactId]
  );
  const titleId = `${windowId}-title`;
  const subtitleId = `${windowId}-subtitle`;
  const registrationPayload = useMemo(() => ({
    title,
    onClose,
    dismissible,
    closeOnBackdrop,
    closeOnEscape,
    minimized: false,
  }), [closeOnBackdrop, closeOnEscape, dismissible, onClose, title]);
  const registrationPayloadRef = useRef(registrationPayload);

  const entry = manager?.windows?.find((candidate) => candidate.id === windowId) || null;
  const sortedVisibleWindows = manager?.windows
    ?.filter((candidate) => !candidate.minimized)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)) || [];
  const isMinimized = Boolean(entry?.minimized);
  const activeVisibleWindowId = sortedVisibleWindows.some(
    (candidate) => candidate.id === manager?.activeWindowId
  )
    ? manager?.activeWindowId
    : null;
  const topVisibleWindowId = activeVisibleWindowId
    || sortedVisibleWindows[sortedVisibleWindows.length - 1]?.id
    || null;
  const isActive = !entry || !topVisibleWindowId ? true : topVisibleWindowId === windowId;
  const isAccessibleDialog = isActive;
  const headerIsDraggable = desktopLike && draggable && dismissible;

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
    interactive: dismissible,
    draggable: desktopLike && draggable,
    resizable: desktopLike && resizable,
    resetKey: windowId,
    initialSize,
    minWidth,
    minHeight,
  });

  useFocusTrap(frameRef, open && !isMinimized && isAccessibleDialog);

  useEffect(() => {
    registrationPayloadRef.current = registrationPayload;
  }, [registrationPayload]);

  useEffect(() => {
    if (!open || !manager) return undefined;

    manager.upsertWindow(windowId, registrationPayloadRef.current);
    manager.activateWindow(windowId);

    return () => manager.unregisterWindow(windowId);
  }, [manager, open, windowId]);

  useEffect(() => {
    if (!open || !manager) return;
    manager.upsertWindow(windowId, registrationPayload);
  }, [manager, open, registrationPayload, windowId]);

  const handleClose = () => {
    if (!dismissible || typeof onClose !== 'function') return;
    onClose();
  };

  const handleMinimize = () => {
    if (!dismissible || !manager) return;
    manager.setWindowMinimized(windowId, true);
  };

  const handleFrameMouseDown = () => {
    if (!isActive) {
      manager?.activateWindow(windowId);
    }
  };

  if (!open || isMinimized || typeof document === 'undefined') return null;

  const frame = (
    <div
      className={`window-modal-root ${themeClassName}`.trim()}
      data-window-modal-root="true"
      style={{ zIndex: 3600 + Number(entry?.order || 0) }}
    >
      <div
        ref={frameRef}
        className={[
          'window-modal-frame',
          dialogClassName,
          isActive ? 'is-active' : 'is-inactive',
          isMaximized ? 'is-maximized' : '',
        ].filter(Boolean).join(' ')}
        style={{
          ...windowStyle,
          zIndex: 1,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
        }}
        onMouseDown={handleFrameMouseDown}
        role={isAccessibleDialog ? 'dialog' : undefined}
        aria-modal={isAccessibleDialog ? 'true' : undefined}
        aria-hidden={isAccessibleDialog ? undefined : 'true'}
        aria-labelledby={isAccessibleDialog && title ? titleId : undefined}
        aria-describedby={isAccessibleDialog && subtitle ? subtitleId : undefined}
        tabIndex={isAccessibleDialog ? -1 : undefined}
      >
        <div
          className={[
            'window-modal-header',
            headerIsDraggable ? 'is-draggable' : 'is-static',
            headerClassName,
          ].filter(Boolean).join(' ')}
          onMouseDown={handleDragStart}
          data-window-drag-handle="true"
        >
          <div className="window-modal-title-group">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>

          <div className="window-modal-toolbar" data-window-ignore-drag="true">
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

  return createPortal(frame, document.body);
}

export default WindowModal;
