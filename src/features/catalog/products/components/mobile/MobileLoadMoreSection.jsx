const MobileLoadMoreSection = ({
  productsHasMore,
  productsLoadTriggerRef,
  isLoadingMore,
  loadMoreProductsRef,
}) => {
  if (!productsHasMore) return null;

  return (
    <div className="mobile-load-more">
      <div ref={productsLoadTriggerRef} className="products-infinite-sentinel" aria-hidden="true" />
      <span className="load-more-status">
        {isLoadingMore ? 'Loading more products...' : 'More products load as you scroll.'}
      </span>
      <button type="button" className="load-more-btn" onClick={() => loadMoreProductsRef.current()}>
        Load Now
      </button>
    </div>
  );
};

export default MobileLoadMoreSection;
