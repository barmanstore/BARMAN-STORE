import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 560;
const VIEWPORT_MARGIN = 16;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const areRectsEqual = (left, right) =>
  left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height;

const readDimension = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getViewport = () => ({
  width: Math.max(window.innerWidth, 320),
  height: Math.max(window.innerHeight, 320),
});

const getCenteredRect = (initialSize, minWidth, minHeight) => {
  const viewport = getViewport();
  const maxWidth = Math.max(minWidth, viewport.width - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(minHeight, viewport.height - VIEWPORT_MARGIN * 2);
  const width = clamp(readDimension(initialSize?.width, DEFAULT_WIDTH), minWidth, maxWidth);
  const height = clamp(readDimension(initialSize?.height, DEFAULT_HEIGHT), minHeight, maxHeight);

  return {
    x: Math.max(VIEWPORT_MARGIN, Math.round((viewport.width - width) / 2)),
    y: Math.max(VIEWPORT_MARGIN, Math.round((viewport.height - height) / 2)),
    width,
    height,
  };
};

const getMaximizedRect = () => {
  const viewport = getViewport();
  return {
    x: VIEWPORT_MARGIN,
    y: VIEWPORT_MARGIN,
    width: Math.max(320, viewport.width - VIEWPORT_MARGIN * 2),
    height: Math.max(320, viewport.height - VIEWPORT_MARGIN * 2),
  };
};

const clampRectToViewport = (rect, minWidth, minHeight) => {
  const viewport = getViewport();
  const width = clamp(rect.width, minWidth, Math.max(minWidth, viewport.width - VIEWPORT_MARGIN * 2));
  const height = clamp(rect.height, minHeight, Math.max(minHeight, viewport.height - VIEWPORT_MARGIN * 2));
  return {
    x: clamp(rect.x, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN)),
    y: clamp(rect.y, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - height - VIEWPORT_MARGIN)),
    width,
    height,
  };
};

function useWindowDragResize({
  open,
  active,
  interactive = true,
  draggable = true,
  resizable = true,
  resetKey = null,
  initialSize,
  minWidth = 420,
  minHeight = 280,
}) {
  const frameRef = useRef(null);
  const interactionRef = useRef(null);
  const previousRectRef = useRef(null);
  const lifecycleRef = useRef({ wasOpen: false, resetKey: null });
  const rectRef = useRef({ x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const pendingRectRef = useRef(null);
  const frameUpdateRafRef = useRef(0);
  const [rect, setRect] = useState(() => ({ x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }));
  const [isMaximized, setIsMaximized] = useState(false);

  const commitRect = useCallback((nextRect) => {
    rectRef.current = nextRect;
    setRect((current) => (areRectsEqual(current, nextRect) ? current : nextRect));
  }, []);

  const flushFrameRect = useCallback(() => {
    frameUpdateRafRef.current = 0;
    const frame = frameRef.current;
    const nextRect = pendingRectRef.current;
    if (!(frame instanceof HTMLElement) || !nextRect) return;

    frame.style.left = `${nextRect.x}px`;
    frame.style.top = `${nextRect.y}px`;
    frame.style.width = `${nextRect.width}px`;
    frame.style.height = `${nextRect.height}px`;
  }, []);

  const scheduleFrameRect = useCallback((nextRect) => {
    rectRef.current = nextRect;
    pendingRectRef.current = nextRect;

    if (frameUpdateRafRef.current || typeof window === 'undefined') return;
    frameUpdateRafRef.current = window.requestAnimationFrame(flushFrameRect);
  }, [flushFrameRect]);

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  useEffect(() => () => {
    if (frameUpdateRafRef.current && typeof window !== 'undefined') {
      window.cancelAnimationFrame(frameUpdateRafRef.current);
    }
  }, []);

  useEffect(() => {
    const previousLifecycle = lifecycleRef.current;
    const opening = open && !previousLifecycle.wasOpen;
    const windowChanged = open && previousLifecycle.resetKey !== resetKey;

    if (!open || typeof window === 'undefined') {
      if (!open) {
        interactionRef.current = null;
      }
      lifecycleRef.current = { wasOpen: open, resetKey };
      return;
    }

    // `initialSize` is an open-time snapshot. Callers often pass inline objects,
    // so rerenders must not recenter or unmaximize the window.
    if (opening || windowChanged) {
      const nextRect = getCenteredRect(initialSize, minWidth, minHeight);
      previousRectRef.current = nextRect;
      commitRect(nextRect);
      setIsMaximized(false);
    }

    lifecycleRef.current = { wasOpen: open, resetKey };
  }, [commitRect, initialSize, minWidth, minHeight, open, resetKey]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;

    const handleResize = () => {
      const nextRect = isMaximized
        ? getMaximizedRect()
        : clampRectToViewport(rectRef.current, minWidth, minHeight);
      commitRect(nextRect);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, commitRect, isMaximized, minWidth, minHeight]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;

    const handleMouseMove = (event) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      event.preventDefault();

      if (interaction.type === 'move') {
        const currentRect = rectRef.current;
        const viewport = getViewport();
        const nextX = clamp(event.clientX - interaction.offsetX, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - currentRect.width - VIEWPORT_MARGIN));
        const nextY = clamp(event.clientY - interaction.offsetY, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - currentRect.height - VIEWPORT_MARGIN));
        scheduleFrameRect({ ...currentRect, x: nextX, y: nextY });
        return;
      }

      const viewport = getViewport();
      const origin = interaction.originRect;
      let nextRect = { ...origin };
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      if (interaction.direction.includes('e')) {
        nextRect.width = clamp(origin.width + deltaX, minWidth, Math.max(minWidth, viewport.width - origin.x - VIEWPORT_MARGIN));
      }
      if (interaction.direction.includes('s')) {
        nextRect.height = clamp(origin.height + deltaY, minHeight, Math.max(minHeight, viewport.height - origin.y - VIEWPORT_MARGIN));
      }
      if (interaction.direction.includes('w')) {
        const nextX = clamp(origin.x + deltaX, VIEWPORT_MARGIN, origin.x + origin.width - minWidth);
        nextRect.x = nextX;
        nextRect.width = origin.width - (nextX - origin.x);
      }
      if (interaction.direction.includes('n')) {
        const nextY = clamp(origin.y + deltaY, VIEWPORT_MARGIN, origin.y + origin.height - minHeight);
        nextRect.y = nextY;
        nextRect.height = origin.height - (nextY - origin.y);
      }

      scheduleFrameRect(clampRectToViewport(nextRect, minWidth, minHeight));
    };

    const handleMouseUp = () => {
      if (interactionRef.current) {
        commitRect(rectRef.current);
      }
      interactionRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [active, commitRect, minHeight, minWidth, scheduleFrameRect]);

  const handleDragStart = useCallback((event) => {
    if (!interactive || !draggable || isMaximized || event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest('[data-window-ignore-drag="true"]')) return;

    interactionRef.current = {
      type: 'move',
      offsetX: event.clientX - rect.x,
      offsetY: event.clientY - rect.y,
    };
  }, [draggable, interactive, isMaximized, rect.x, rect.y]);

  const handleResizeStart = useCallback((event, direction) => {
    if (!interactive || !resizable || isMaximized || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = {
      type: 'resize',
      direction,
      startX: event.clientX,
      startY: event.clientY,
      originRect: rect,
    };
  }, [interactive, isMaximized, rect, resizable]);

  const toggleMaximize = useCallback(() => {
    if (!interactive) return;
    if (isMaximized) {
      const restoredRect = previousRectRef.current || getCenteredRect(initialSize, minWidth, minHeight);
      commitRect(clampRectToViewport(restoredRect, minWidth, minHeight));
      setIsMaximized(false);
      return;
    }

    previousRectRef.current = rectRef.current;
    commitRect(getMaximizedRect());
    setIsMaximized(true);
  }, [commitRect, initialSize, interactive, isMaximized, minHeight, minWidth]);

  const windowStyle = useMemo(() => ({
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }), [rect]);

  return {
    frameRef,
    isMaximized,
    windowStyle,
    handleDragStart,
    handleResizeStart,
    toggleMaximize,
  };
}

export default useWindowDragResize;
