import classNames from 'classnames';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minus, X } from 'lucide-react';
import useIsMobile from '../../hooks/useIsMobile';
import useFocusTrap from '../../hooks/useFocusTrap';
import useWindowDragResize from '../../hooks/useWindowDragResize';
import { useWindowManager } from './WindowManagerProvider';

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const WINDOW_ROOT_Z_INDEX = 3600;
const WINDOW_FRAME_BASE_CLASS = 'window-modal-frame fixed z-[1] flex min-h-[220px] min-w-[320px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-[18px] border border-[rgba(148,163,184,0.26)] bg-[var(--color-card)] pointer-events-auto transition-[box-shadow,opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none';
const WINDOW_FRAME_ACTIVE_CLASS = 'is-active opacity-100 shadow-[0_30px_70px_rgba(15,23,42,0.22),0_0_0_1px_rgba(255,255,255,0.4)_inset]';
const WINDOW_FRAME_INACTIVE_CLASS = 'is-inactive opacity-[0.94] shadow-[0_18px_38px_rgba(15,23,42,0.14),0_0_0_1px_rgba(255,255,255,0.28)_inset]';
const WINDOW_HEADER_BASE_CLASS = 'window-modal-header flex select-none items-start justify-between gap-[0.9rem] border-b border-[rgba(148,163,184,0.22)] bg-white/[0.78] px-4 py-[0.9rem]';
const WINDOW_CONTROL_BUTTON_CLASS = 'window-modal-control-btn inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[rgba(148,163,184,0.36)] bg-slate-50/[0.9] text-[var(--color-primary)] transition-[transform,background,border-color] duration-150 ease-out hover:-translate-y-px hover:bg-slate-100/[0.98] hover:border-[rgba(15,118,110,0.4)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none';
const WINDOW_CLOSE_BUTTON_CLASS = 'window-modal-close-btn hover:bg-red-100/[0.98] hover:border-[rgba(239,68,68,0.38)] hover:text-red-800';
const RESIZE_HANDLE_CLASS_BY_DIRECTION = {
  n: 'left-3 right-3 top-[-4px] h-2 cursor-ns-resize',
  s: 'bottom-[-4px] left-3 right-3 h-2 cursor-ns-resize',
  e: 'right-[-4px] top-3 bottom-3 w-2 cursor-ew-resize',
  w: 'left-[-4px] top-3 bottom-3 w-2 cursor-ew-resize',
  ne: 'top-[-4px] right-[-4px] h-[14px] w-[14px] cursor-nesw-resize',
  nw: 'top-[-4px] left-[-4px] h-[14px] w-[14px] cursor-nwse-resize',
  se: 'right-[-4px] bottom-[-4px] h-[14px] w-[14px] cursor-nwse-resize',
  sw: 'left-[-4px] bottom-[-4px] h-[14px] w-[14px] cursor-nesw-resize',
};

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
  const windows = manager?.windows || [];
  const activeWindowId = manager?.activeWindowId || null;
  const upsertWindow = manager?.upsertWindow;
  const unregisterWindow = manager?.unregisterWindow;
  const activateWindow = manager?.activateWindow;
  const setWindowMinimized = manager?.setWindowMinimized;
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
  const handleManagedClose = useCallback(() => {
    if (typeof onCloseRef.current === 'function') {
      onCloseRef.current();
    }
  }, []);
  const registrationPayload = useMemo(() => ({
    title,
    onClose: handleManagedClose,
    dismissible,
    closeOnBackdrop,
    closeOnEscape,
  }), [closeOnBackdrop, closeOnEscape, dismissible, handleManagedClose, title]);
  const registrationPayloadRef = useRef(registrationPayload);

  const entry = windows.find((candidate) => candidate.id === windowId) || null;
  const sortedVisibleWindows = windows
    .filter((candidate) => !candidate.minimized)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const isRegistered = Boolean(entry);
  const isMinimized = Boolean(entry?.minimized);
  const activeVisibleWindowId = sortedVisibleWindows.some(
    (candidate) => candidate.id === activeWindowId
  )
    ? activeWindowId
    : null;
  const topVisibleWindowId = activeVisibleWindowId
    || sortedVisibleWindows[sortedVisibleWindows.length - 1]?.id
    || null;
  const isActive = isRegistered && topVisibleWindowId === windowId;
  const isAccessibleDialog = open && !isMinimized && isActive;
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

  useFocusTrap(frameRef, isAccessibleDialog, {
    open,
    restoreOnDeactivate: false,
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    registrationPayloadRef.current = registrationPayload;
  }, [registrationPayload]);

  useEffect(() => {
    if (!open || typeof upsertWindow !== 'function') return undefined;

    upsertWindow(windowId, registrationPayloadRef.current);
    if (typeof activateWindow === 'function') {
      activateWindow(windowId);
    }

    return () => {
      if (typeof unregisterWindow === 'function') {
        unregisterWindow(windowId);
      }
    };
  }, [activateWindow, open, unregisterWindow, upsertWindow, windowId]);

  useEffect(() => {
    if (!open || typeof upsertWindow !== 'function') return;
    upsertWindow(windowId, registrationPayload);
  }, [open, registrationPayload, upsertWindow, windowId]);

  const handleClose = () => {
    if (!dismissible) return;
    handleManagedClose();
  };

  const handleMinimize = () => {
    if (!dismissible || typeof setWindowMinimized !== 'function') return;
    setWindowMinimized(windowId, true);
  };

  const handleFrameMouseDown = () => {
    if (isRegistered && !isActive) {
      activateWindow?.(windowId);
    }
  };

  if (!open || isMinimized || typeof document === 'undefined') return null;

  const frame = (
    <div
      className={classNames(
        'window-modal-root pointer-events-none fixed inset-0 isolate',
        themeClassName
      )}
      data-window-modal-root="true"
      style={{ zIndex: WINDOW_ROOT_Z_INDEX + Number(entry?.order || 0) }}
    >
      <div
        ref={frameRef}
        className={classNames(
          WINDOW_FRAME_BASE_CLASS,
          isActive ? WINDOW_FRAME_ACTIVE_CLASS : WINDOW_FRAME_INACTIVE_CLASS,
          isMaximized && 'is-maximized',
          dialogClassName
        )}
        style={windowStyle}
        onMouseDown={handleFrameMouseDown}
        role={isAccessibleDialog ? 'dialog' : undefined}
        aria-modal={isAccessibleDialog ? 'true' : undefined}
        aria-hidden={isAccessibleDialog ? undefined : 'true'}
        aria-labelledby={isAccessibleDialog && title ? titleId : undefined}
        aria-describedby={isAccessibleDialog && subtitle ? subtitleId : undefined}
        aria-label={isAccessibleDialog && !title ? 'Dialog' : undefined}
        tabIndex={isAccessibleDialog ? -1 : undefined}
      >
        <div
          className={classNames(
            WINDOW_HEADER_BASE_CLASS,
            headerIsDraggable ? 'is-draggable cursor-move' : 'is-static cursor-default',
            headerClassName
          )}
          onMouseDown={headerIsDraggable ? handleDragStart : undefined}
          data-window-drag-handle="true"
        >
          <div className="window-modal-title-group min-w-0 flex-1">
            {title ? (
              <h2 id={titleId} className="m-0 text-[1rem] leading-[1.25]">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p
                id={subtitleId}
                className="mt-1 text-[0.85rem] leading-[1.4] text-[var(--color-text-muted)]"
              >
                {subtitle}
              </p>
            ) : null}
          </div>

          <div
            className="window-modal-toolbar inline-flex shrink-0 items-center gap-[0.65rem]"
            data-window-ignore-drag="true"
          >
            {headerActions}
            <div className="window-modal-controls inline-flex items-center gap-[0.45rem]">
              {desktopLike && minimizable ? (
                <button
                  type="button"
                  className={WINDOW_CONTROL_BUTTON_CLASS}
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
                  className={WINDOW_CONTROL_BUTTON_CLASS}
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
                className={classNames(
                  WINDOW_CONTROL_BUTTON_CLASS,
                  WINDOW_CLOSE_BUTTON_CLASS,
                  closeButtonClassName
                )}
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

        <div
          className={classNames(
            'window-modal-body min-h-0 flex-1 overflow-auto overscroll-contain',
            contentClassName
          )}
        >
          {children}
        </div>

        {desktopLike && resizable && dismissible && !isMaximized ? (
          <>
            {RESIZE_DIRECTIONS.map((direction) => (
              <div
                key={direction}
                className={classNames(
                  'window-modal-resize-handle absolute z-[2]',
                  `window-modal-resize-${direction}`,
                  RESIZE_HANDLE_CLASS_BY_DIRECTION[direction]
                )}
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
