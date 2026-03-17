import MobileCategoryHero from './MobileCategoryHero';
import MobileOffersSection from './MobileOffersSection';
import MobileRepeatOrderSection from './MobileRepeatOrderSection';
import MobilePopularSection from './MobilePopularSection';
import MobileRestockSection from './MobileRestockSection';
import MobileQuickAddSection from './MobileQuickAddSection';
import MobileTabsSection from './MobileTabsSection';
import MobileLoadMoreSection from './MobileLoadMoreSection';

const MobileShopBody = ({
  loading,
  productsLength,
  notice,
  error,
  selectedCategory,
  mobileSubcategories,
  selectedSubcategory,
  handleMobileSubcategorySelect,
  normalizeText,
  mobileOffers,
  handleMobileOfferAction,
  repeatOrderFamilies,
  recentlyBoughtFamilies,
  handleRepeatOrder,
  openFamilyDetails,
  getSelectedVariation,
  getFamilyPreviewVariation,
  popularFamilies,
  renderMobileProductCard,
  smartRestockItems,
  handleRestockAll,
  addToCart,
  quickAddFamilies,
  MOBILE_TAB_OPTIONS,
  activeMobileTab,
  setActiveMobileTab,
  activeTabFamilies,
  productsHasMore,
  productsLoadTriggerRef,
  isLoadingMore,
  loadMoreProductsRef,
}) => (
  <div className="mobile-shop-body">
    {loading && productsLength > 0 ? (
      <div className="mobile-refresh-banner" aria-live="polite">
        Updating products...
      </div>
    ) : null}

    {notice && (
      <div className={`mobile-notice ${notice.type === 'error' ? 'error' : 'info'}`}>
        {notice.message}
      </div>
    )}

    {error ? <div className="mobile-error">{error}</div> : null}

    {loading && productsLength === 0 ? (
      <div className="mobile-shop-skeleton">
        <div className="products-skeleton-header shimmer-skeleton" aria-hidden="true" />
        <div className="products-skeleton-controls shimmer-skeleton" aria-hidden="true" />
        <div className="products-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`mobile-skeleton-${index}`} className="product-skeleton-card shimmer-skeleton" />
          ))}
        </div>
      </div>
    ) : (
      <>
        <MobileCategoryHero
          selectedCategory={selectedCategory}
          mobileSubcategories={mobileSubcategories}
          selectedSubcategory={selectedSubcategory}
          handleMobileSubcategorySelect={handleMobileSubcategorySelect}
          normalizeText={normalizeText}
        />

        <MobileOffersSection
          mobileOffers={mobileOffers}
          handleMobileOfferAction={handleMobileOfferAction}
        />

        <MobileRepeatOrderSection
          repeatOrderFamilies={repeatOrderFamilies}
          recentlyBoughtFamilies={recentlyBoughtFamilies}
          handleRepeatOrder={handleRepeatOrder}
          openFamilyDetails={openFamilyDetails}
          getSelectedVariation={getSelectedVariation}
          getFamilyPreviewVariation={getFamilyPreviewVariation}
        />

        <MobilePopularSection
          popularFamilies={popularFamilies}
          renderMobileProductCard={renderMobileProductCard}
        />

        <MobileRestockSection
          smartRestockItems={smartRestockItems}
          handleRestockAll={handleRestockAll}
          addToCart={addToCart}
        />

        <MobileQuickAddSection
          quickAddFamilies={quickAddFamilies}
          renderMobileProductCard={renderMobileProductCard}
        />

        <MobileTabsSection
          MOBILE_TAB_OPTIONS={MOBILE_TAB_OPTIONS}
          activeMobileTab={activeMobileTab}
          setActiveMobileTab={setActiveMobileTab}
          activeTabFamilies={activeTabFamilies}
          renderMobileProductCard={renderMobileProductCard}
        />

        <MobileLoadMoreSection
          productsHasMore={productsHasMore}
          productsLoadTriggerRef={productsLoadTriggerRef}
          isLoadingMore={isLoadingMore}
          loadMoreProductsRef={loadMoreProductsRef}
        />
      </>
    )}
  </div>
);

export default MobileShopBody;

