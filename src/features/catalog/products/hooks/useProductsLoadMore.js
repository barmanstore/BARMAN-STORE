import { useEffect } from 'react';

export default function useProductsLoadMore({
  loading,
  isLoadingMore,
  productsHasMore,
  productsLoadTriggerRef,
  loadMoreProductsRef,
  rootMargin,
  deps = [],
}) {
  useEffect(() => {
    if (loading || isLoadingMore || !productsHasMore) return undefined;
    const node = productsLoadTriggerRef.current;
    if (!node || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          loadMoreProductsRef.current();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, isLoadingMore, productsHasMore, productsLoadTriggerRef, loadMoreProductsRef, rootMargin, ...deps]);
}
