export const createInertBackgroundState = () => ({
  lockCount: 0,
  snapshot: null,
});

const getAriaHidden = (element) => {
  if (typeof element?.getAttribute !== 'function') return null;
  return element.getAttribute('aria-hidden');
};

const setAriaHidden = (element, value) => {
  if (value == null) {
    if (typeof element?.removeAttribute === 'function') {
      element.removeAttribute('aria-hidden');
    }
    return;
  }
  if (typeof element?.setAttribute === 'function') {
    element.setAttribute('aria-hidden', value);
  }
};

export const captureInertBackgroundSnapshot = (element) => {
  if (!element) return null;
  const supportsInert = 'inert' in element;
  return {
    element,
    supportsInert,
    inert: supportsInert ? Boolean(element.inert) : false,
    pointerEvents: element?.style?.pointerEvents || '',
    ariaHidden: getAriaHidden(element),
  };
};

export const applyInertBackgroundSnapshot = (snapshot) => {
  if (!snapshot?.element) return;
  const { element, supportsInert } = snapshot;
  if (supportsInert) {
    element.inert = true;
  } else if (element?.style) {
    element.style.pointerEvents = 'none';
  }
  setAriaHidden(element, 'true');
};

export const restoreInertBackgroundSnapshot = (snapshot) => {
  if (!snapshot?.element) return;
  const { element, supportsInert, inert, pointerEvents, ariaHidden } = snapshot;
  if (supportsInert) {
    element.inert = inert;
  } else if (element?.style) {
    element.style.pointerEvents = pointerEvents;
  }
  setAriaHidden(element, ariaHidden);
};

export const acquireInertBackgroundLock = (state, element) => {
  if (!state || !element) return () => {};

  if (state.lockCount === 0) {
    state.snapshot = captureInertBackgroundSnapshot(element);
    applyInertBackgroundSnapshot(state.snapshot);
  }

  state.lockCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    state.lockCount = Math.max(0, state.lockCount - 1);
    if (state.lockCount !== 0 || !state.snapshot) return;
    restoreInertBackgroundSnapshot(state.snapshot);
    state.snapshot = null;
  };
};
