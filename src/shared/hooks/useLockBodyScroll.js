import { useEffect } from 'react';

let activeLockCount = 0;
let previousBodyStyles = null;
let lockedScrollY = 0;

const applyBodyScrollLock = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (activeLockCount > 0) {
    activeLockCount += 1;
    return;
  }

  const { body, documentElement } = document;
  lockedScrollY = window.scrollY || window.pageYOffset || 0;
  const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);

  previousBodyStyles = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  activeLockCount = 1;
};

const releaseBodyScrollLock = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || activeLockCount === 0) return;
  activeLockCount -= 1;
  if (activeLockCount > 0) return;

  const { body } = document;
  const restore = previousBodyStyles || {};
  body.style.overflow = restore.overflow || '';
  body.style.position = restore.position || '';
  body.style.top = restore.top || '';
  body.style.left = restore.left || '';
  body.style.right = restore.right || '';
  body.style.width = restore.width || '';
  body.style.paddingRight = restore.paddingRight || '';
  previousBodyStyles = null;
  window.scrollTo(0, lockedScrollY);
};

function useLockBodyScroll(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    applyBodyScrollLock();
    return () => releaseBodyScrollLock();
  }, [enabled]);
}

export default useLockBodyScroll;
