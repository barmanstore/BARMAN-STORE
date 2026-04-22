const formatOfferMeta = (offer) => {
  if (offer?.hasPriceDrop && Number(offer?.savings || 0) > 0) {
    return `Save Rs ${Number(offer.savings).toFixed(2)}`;
  }
  if (String(offer?.category || '').trim()) {
    return `In ${String(offer.category).trim()}`;
  }
  return 'Limited-time pick';
};

const MobileOffersSection = ({ mobileOffers, handleMobileOfferAction }) => {
  if (!Array.isArray(mobileOffers) || mobileOffers.length === 0) return null;

  return (
    <section className="mobile-section mobile-offers" aria-label="Featured offers">
      <div className="mobile-offers-shell">
        <div className="mobile-section-head mobile-offers-head">
          <div>
            <span className="mobile-offers-kicker">Featured savings</span>
            <h3>Offers & Picks</h3>
            <p>Live promotions and curated bundles right below your category view.</p>
          </div>
          <span className="mobile-offers-count">{mobileOffers.length} live</span>
        </div>

        <div className="mobile-offer-row horizontal-group-row">
          {mobileOffers.map((offer) => (
            <article key={offer.id} className={`mobile-offer-card ${offer.tone}`}>
              <div className="mobile-offer-card-top">
                <p className="offer-kicker">{offer?.combo ? 'Bundle pick' : 'Live offer'}</p>
                <span className="mobile-offer-meta">{formatOfferMeta(offer)}</span>
              </div>

              <div className="mobile-offer-card-body">
                <h4>{offer.title}</h4>
                <p>{offer.subtitle}</p>
              </div>

              <button type="button" onClick={() => handleMobileOfferAction(offer)}>
                <span>{offer.action}</span>
                <span aria-hidden="true">+</span>
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MobileOffersSection;
