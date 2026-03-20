import { useEffect } from 'react';

function useInertBackground(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;

    const appRoot = document.querySelector('[data-window-background-root="true"]')
      || document.querySelector('.app')
      || document.getElementById('root');
    if (!(appRoot instanceof HTMLElement)) return undefined;

    const previousAriaHidden = appRoot.getAttribute('aria-hidden');
    const previousPointerEvents = appRoot.style.pointerEvents;
    const supportsInert = 'inert' in appRoot;
    const previousInert = supportsInert ? Boolean(appRoot.inert) : false;

    if (supportsInert) {
      appRoot.inert = true;
    } else {
      appRoot.style.pointerEvents = 'none';
    }
    appRoot.setAttribute('aria-hidden', 'true');

    return () => {
      if (supportsInert) {
        appRoot.inert = previousInert;
      } else {
        appRoot.style.pointerEvents = previousPointerEvents;
      }

      if (previousAriaHidden == null) {
        appRoot.removeAttribute('aria-hidden');
      } else {
        appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
    };
  }, [active]);
}

export default useInertBackground;
