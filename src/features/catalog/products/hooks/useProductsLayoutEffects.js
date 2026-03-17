import { useEffect } from 'react';

function useProductsLayoutEffects({ productsPageRef, controlsRef, mobileHeaderRef, isMobile }) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const pageNode = productsPageRef.current;
    const controlsNode = controlsRef.current;
    if (!pageNode || !controlsNode) return undefined;

    const updateStickyMetrics = () => {
      const controlsHeight = Math.ceil(controlsNode.getBoundingClientRect().height || 0);
      pageNode.style.setProperty('--products-controls-height', `${Math.max(0, controlsHeight)}px`);
    };

    updateStickyMetrics();
    window.addEventListener('resize', updateStickyMetrics);
    let resizeObserver;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => updateStickyMetrics());
      resizeObserver.observe(controlsNode);
    }

    return () => {
      window.removeEventListener('resize', updateStickyMetrics);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [productsPageRef, controlsRef]);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return undefined;
    const pageNode = productsPageRef.current;
    const headerNode = mobileHeaderRef.current;
    if (!pageNode || !headerNode) return undefined;

    const updateHeaderHeight = () => {
      const nextHeight = Math.ceil(headerNode.getBoundingClientRect().height || 0);
      pageNode.style.setProperty('--mobile-shop-header-height', `${Math.max(0, nextHeight)}px`);
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    let resizeObserver;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => updateHeaderHeight());
      resizeObserver.observe(headerNode);
    }

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      if (resizeObserver) resizeObserver.disconnect();
      pageNode.style.removeProperty('--mobile-shop-header-height');
    };
  }, [isMobile, productsPageRef, mobileHeaderRef]);
}

export default useProductsLayoutEffects;
