import { useEffect } from 'react';
import {
  acquireInertBackgroundLock,
  createInertBackgroundState,
} from './inertBackgroundRuntime.mjs';

const inertBackgroundState = createInertBackgroundState();

const resolveBackgroundRoot = () => {
  if (typeof document === 'undefined') return null;
  const explicitRoot = document.querySelector('[data-window-background-root="true"]');
  if (explicitRoot instanceof HTMLElement) {
    return explicitRoot;
  }

  const fallbackRoot = document.querySelector('.app') || document.getElementById('root');
  if (
    import.meta.env.DEV
    && fallbackRoot instanceof HTMLElement
    && typeof console !== 'undefined'
    && typeof console.error === 'function'
  ) {
    console.error('Missing [data-window-background-root=\"true\"] shell marker. Falling back to legacy app root.');
  }

  return fallbackRoot instanceof HTMLElement ? fallbackRoot : null;
};

function useInertBackground(active) {
  useEffect(() => {
    if (!active) return undefined;

    const backgroundRoot = resolveBackgroundRoot();
    if (!(backgroundRoot instanceof HTMLElement)) return undefined;
    return acquireInertBackgroundLock(inertBackgroundState, backgroundRoot);
  }, [active]);
}

export default useInertBackground;
