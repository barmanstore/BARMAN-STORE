const MobileOffersSection = ({ mobileOffers, handleMobileOfferAction }) => (
  <section className="mobile-section mobile-offers">
    <div className="mobile-section-head">
      <div>
        <h3>Offers & Picks</h3>
        <p>Limited time savings for you.</p>
      </div>
    </div>
    <div className="mobile-offer-row horizontal-group-row">
      {mobileOffers.map((offer) => (
        <article key={offer.id} className={`mobile-offer-card ${offer.tone}`}>
          <p className="offer-kicker">Limited time</p>
          <h4>{offer.title}</h4>
          <p>{offer.subtitle}</p>
          <button type="button" onClick={() => handleMobileOfferAction(offer)}>
            {offer.action}
          </button>
        </article>
      ))}
    </div>
  </section>
);

export default MobileOffersSection;

