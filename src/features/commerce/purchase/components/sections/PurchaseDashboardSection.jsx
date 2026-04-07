import PurchasePlanningPanel from './dashboard/PurchasePlanningPanel';

const PurchaseDashboardSection = ({
  operationsSummary,
  lowStockProducts,
  onDraftDistributor,
  onOpenPayable,
  onCloseVisit,
  onReopenVisit,
  formatCurrency,
  toNumber,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-sector-details">
      <PurchasePlanningPanel
        operationsSummary={operationsSummary}
        lowStockProducts={lowStockProducts}
        onDraftDistributor={onDraftDistributor}
        onOpenPayable={onOpenPayable}
        onCloseVisit={onCloseVisit}
        onReopenVisit={onReopenVisit}
        formatCurrency={formatCurrency}
        toNumber={toNumber}
      />
    </div>
  </section>
);

export default PurchaseDashboardSection;
