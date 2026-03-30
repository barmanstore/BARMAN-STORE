import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useInertBackground from '../shared/hooks/useInertBackground';
import {
  selectTopEscapeEntry,
  shouldLockOverlayBackground,
} from './overlayStackUtils.mjs';

const OverlayContext = createContext(null);
let overlaySequence = 0;

export function OverlayProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [hostNode, setHostNode] = useState(null);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const node = document.createElement('div');
    node.setAttribute('data-overlay-root', 'true');
    document.body.appendChild(node);
    setHostNode(node);
    return () => {
      document.body.removeChild(node);
      setHostNode(null);
    };
  }, []);

  const registerEntry = useCallback((entry) => {
    const sequence = overlaySequence += 1;
    const token = `overlay-entry-${sequence}`;
    const nextEntry = { ...entry, token, sequence };
    setEntries((current) => [...current.filter((item) => item.id !== entry.id), nextEntry]);
    return () => {
      setEntries((current) => current.filter((item) => item.token !== token));
    };
  }, []);

  useInertBackground(shouldLockOverlayBackground(entries));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const nextEntry = selectTopEscapeEntry(entries);
      if (!nextEntry) return;
      event.preventDefault();
      nextEntry.onEscape();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entries]);

  const value = useMemo(() => ({
    hostNode,
    registerEntry,
  }), [hostNode, registerEntry]);

  return (
    <OverlayContext.Provider value={value}>
      {children}
    </OverlayContext.Provider>
  );
}

export const useOverlayStackEntry = ({
  active,
  id,
  type,
  zIndex = 0,
  getZIndex = null,
  onEscape = null,
}) => {
  const context = useContext(OverlayContext);
  const getZIndexRef = useRef(getZIndex);
  const onEscapeRef = useRef(onEscape);
  const hasDynamicZIndex = typeof getZIndex === 'function';
  const hasEscapeHandler = typeof onEscape === 'function';

  useEffect(() => {
    getZIndexRef.current = getZIndex;
  }, [getZIndex]);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!context || !active || !id) return undefined;

    const entryGetZIndex = hasDynamicZIndex
      ? () => {
        const resolver = getZIndexRef.current;
        return typeof resolver === 'function' ? resolver() : zIndex;
      }
      : null;
    const entryOnEscape = hasEscapeHandler
      ? () => {
        const escapeHandler = onEscapeRef.current;
        if (typeof escapeHandler === 'function') {
          escapeHandler();
        }
      }
      : null;

    return context.registerEntry({
      id,
      type,
      zIndex,
      getZIndex: entryGetZIndex,
      onEscape: entryOnEscape,
    });
  }, [active, context, hasDynamicZIndex, hasEscapeHandler, id, type, zIndex]);
};

export function OverlayEntry({
  active,
  id,
  type,
  zIndex = 0,
  getZIndex = null,
  onEscape = null,
  children,
}) {
  const context = useContext(OverlayContext);
  useOverlayStackEntry({ active, id, type, zIndex, getZIndex, onEscape });

  if (!active || !context?.hostNode || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, context.hostNode);
}

export const useOverlay = () => {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error('useOverlay must be used within OverlayProvider');
  }
  return context;
};
