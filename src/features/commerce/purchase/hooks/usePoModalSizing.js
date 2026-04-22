import { useEffect, useRef, useState } from 'react';

function usePoModalSizing({ isMobile, storageKey, toNumber }) {
  const [poModalSize, setPoModalSize] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const width = toNumber(parsed.width);
      const height = toNumber(parsed.height);
      return {
        width: width > 0 ? width : 980,
        height: height > 0 ? height : 760,
      };
    } catch (_) {
      return { width: 980, height: 760 };
    }
  });
  const [isResizingPoModal, setIsResizingPoModal] = useState(false);
  const poModalRef = useRef(null);
  const poModalResizeRef = useRef(null);
  const poModalSizeRef = useRef(poModalSize);

  useEffect(() => {
    poModalSizeRef.current = poModalSize;
  }, [poModalSize]);

  useEffect(() => {
    if (!isResizingPoModal) return undefined;

    const handleMouseMove = (event) => {
      const state = poModalResizeRef.current;
      if (!state) return;

      const nextWidth = state.startWidth + (event.clientX - state.startX);
      const nextHeight = state.startHeight + (event.clientY - state.startY);
      const minWidth = 760;
      const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth * 0.95));
      const minHeight = 520;
      const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.9));

      setPoModalSize({
        width: Math.min(maxWidth, Math.max(minWidth, nextWidth)),
        height: Math.min(maxHeight, Math.max(minHeight, nextHeight)),
      });
    };

    const stopResizing = () => {
      setIsResizingPoModal(false);
      poModalResizeRef.current = null;
      document.body.classList.remove('po-modal-resizing');
      try {
        localStorage.setItem(storageKey, JSON.stringify(poModalSizeRef.current));
      } catch (_) {
        // ignore storage errors
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizingPoModal, storageKey]);

  const handlePoModalResizeStart = (event) => {
    if (isMobile) return;
    if (!poModalRef.current) return;
    event.preventDefault();
    const rect = poModalRef.current.getBoundingClientRect();
    poModalResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    document.body.classList.add('po-modal-resizing');
    setIsResizingPoModal(true);
  };

  return {
    poModalSize,
    setPoModalSize,
    poModalRef,
    handlePoModalResizeStart,
    isResizingPoModal,
  };
}

export default usePoModalSizing;
