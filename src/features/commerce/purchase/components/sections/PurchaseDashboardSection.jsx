import PurchasePlanningPanel from './dashboard/PurchasePlanningPanel';

const PurchaseDashboardSection = ({
  operationsSummary,
  lowStockProducts,
  onDraftDistributor,
  onOpenOrder,
  onOpenPayable,
  onCloseVisit,
  onReopenVisit,
  savedOrderDrafts,
  openSavedOrderDraft,
  formatCurrency,
  toNumber,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-sector-details">
      <PurchasePlanningPanel
        operationsSummary={operationsSummary}
        lowStockProducts={lowStockProducts}
        onDraftDistributor={onDraftDistributor}
        onOpenOrder={onOpenOrder}
        onOpenPayable={onOpenPayable}
        onCloseVisit={onCloseVisit}
        onReopenVisit={onReopenVisit}
        savedOrderDrafts={savedOrderDrafts}
        openSavedOrderDraft={openSavedOrderDraft}
        formatCurrency={formatCurrency}
        toNumber={toNumber}
      />
    </div>
  </section>
);

export default PurchaseDashboardSection;
