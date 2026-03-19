import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

const isVisible = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;

    const container = containerRef.current;
    if (!(container instanceof HTMLElement)) return undefined;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableNodes = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);

    const focusInitialNode = () => {
      const initialTarget = container.querySelector('[data-window-initial-focus="true"], [autofocus]');
      if (initialTarget instanceof HTMLElement && isVisible(initialTarget)) {
        initialTarget.focus({ preventScroll: true });
        return;
      }

      const focusableNodes = getFocusableNodes();
      if (focusableNodes.length > 0) {
        focusableNodes[0].focus({ preventScroll: true });
        return;
      }

      container.focus({ preventScroll: true });
    };

    const focusFrame = window.requestAnimationFrame(() => {
      if (!container.contains(document.activeElement)) {
        focusInitialNode();
      }
    });

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const focusableNodes = getFocusableNodes();
      if (focusableNodes.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const firstNode = focusableNodes[0];
      const lastNode = focusableNodes[focusableNodes.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstNode || !container.contains(activeElement)) {
          event.preventDefault();
          lastNode.focus({ preventScroll: true });
        }
        return;
      }

      if (activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus({ preventScroll: true });
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      container.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef]);
}

export default useFocusTrap;
