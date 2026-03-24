import { useEffect } from 'react';

const backgroundStateByRoot = new WeakMap();

function useInertBackground(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;

    const appRoot = document.querySelector('[data-window-background-root="true"]')
      || document.querySelector('.app')
      || document.getElementById('root');
    if (!(appRoot instanceof HTMLElement)) return undefined;

    let state = backgroundStateByRoot.get(appRoot);
    if (!state) {
      const supportsInert = 'inert' in appRoot;
      state = {
        count: 0,
        supportsInert,
        previousAriaHidden: appRoot.getAttribute('aria-hidden'),
        previousPointerEvents: appRoot.style.pointerEvents,
        previousInert: supportsInert ? Boolean(appRoot.inert) : false,
      };
      backgroundStateByRoot.set(appRoot, state);
    }

    if (state.count === 0) {
      if (state.supportsInert) {
        appRoot.inert = true;
      } else {
        appRoot.style.pointerEvents = 'none';
      }
      appRoot.setAttribute('aria-hidden', 'true');
    }
    state.count += 1;

    return () => {
      const currentState = backgroundStateByRoot.get(appRoot);
      if (!currentState) return;

      currentState.count = Math.max(0, Number(currentState.count || 0) - 1);
      if (currentState.count > 0) return;

      if (currentState.supportsInert) {
        appRoot.inert = currentState.previousInert;
      } else {
        appRoot.style.pointerEvents = currentState.previousPointerEvents;
      }

      if (currentState.previousAriaHidden == null) {
        appRoot.removeAttribute('aria-hidden');
      } else {
        appRoot.setAttribute('aria-hidden', currentState.previousAriaHidden);
      }

      backgroundStateByRoot.delete(appRoot);
    };
  }, [active]);
}

export default useInertBackground;
