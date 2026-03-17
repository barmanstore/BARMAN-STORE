const ProductsLoadMore = ({
  hasMoreProducts,
  isLoadingMore,
  productsLoadTriggerRef,
  loadMoreProductsRef,
}) => {
  if (!hasMoreProducts) return null;

  return (
    <div className="load-more-wrap">
      <div ref={productsLoadTriggerRef} className="products-infinite-sentinel" aria-hidden="true" />
      <span className="load-more-status">
        {isLoadingMore ? 'Loading more products...' : 'More products load automatically as you scroll.'}
      </span>
      <button type="button" className="load-more-btn" onClick={() => loadMoreProductsRef.current()}>
        Load Now
      </button>
    </div>
  );
};

export default ProductsLoadMore;

