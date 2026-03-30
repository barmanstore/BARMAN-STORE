import { useState } from 'react';
import PurchaseDashboardHero from './dashboard/PurchaseDashboardHero';
import PurchaseDeliveriesPanel from './dashboard/PurchaseDeliveriesPanel';
import PurchaseInsightsPanel from './dashboard/PurchaseInsightsPanel';
import PurchasePaymentsPanel from './dashboard/PurchasePaymentsPanel';
import PurchasePlanningPanel from './dashboard/PurchasePlanningPanel';
import PurchaseWorkflowPanel from './dashboard/PurchaseWorkflowPanel';

const PurchaseDashboardSection = ({
  operationsLoading,
  operationsCardItems,
  operationsSummary,
  lowStockProducts,
  onDraftDistributor,
  onOpenOrder,
  onOpenPayable,
  onNewOrder,
  onOpenLedgerForm,
  onOpenReturn,
  rollupParams,
  setRollupParams,
  formatCurrency,
  toNumber,
}) => {
  const [activeSector, setActiveSector] = useState('planning');
  const actionRollups = operationsSummary?.action_rollups || {};
  const rollupTotals = actionRollups.totals || {};
  const rollupRangeLabel = actionRollups.range?.start_date
    ? `${actionRollups.range.start_date} -> ${actionRollups.range.end_date || actionRollups.range.start_date}`
    : 'Range not available';

  return (
    <section className="purchase-section-shell">
      <PurchaseDashboardHero
        operationsLoading={operationsLoading}
        operationsCardItems={operationsCardItems}
        onNewOrder={onNewOrder}
        onOpenLedgerForm={onOpenLedgerForm}
        onOpenReturn={onOpenReturn}
        activeSector={activeSector}
        setActiveSector={setActiveSector}
        operationsSummary={operationsSummary}
        rollupRangeLabel={rollupRangeLabel}
        rollupTotals={rollupTotals}
        formatCurrency={formatCurrency}
        toNumber={toNumber}
      />
      <div className="purchase-sector-details">
        {activeSector === 'planning' ? (
          <PurchasePlanningPanel
            operationsSummary={operationsSummary}
            lowStockProducts={lowStockProducts}
            onDraftDistributor={onDraftDistributor}
            onNewOrder={onNewOrder}
            formatCurrency={formatCurrency}
            toNumber={toNumber}
          />
        ) : null}
        {activeSector === 'payments' ? (
          <PurchasePaymentsPanel
            operationsSummary={operationsSummary}
            onOpenPayable={onOpenPayable}
            formatCurrency={formatCurrency}
            toNumber={toNumber}
          />
        ) : null}
        {activeSector === 'deliveries' ? (
          <PurchaseDeliveriesPanel
            operationsSummary={operationsSummary}
            toNumber={toNumber}
          />
        ) : null}
        {activeSector === 'workflow' ? (
          <PurchaseWorkflowPanel
            operationsSummary={operationsSummary}
            onOpenOrder={onOpenOrder}
          />
        ) : null}
        {activeSector === 'insights' ? (
          <PurchaseInsightsPanel
            operationsSummary={operationsSummary}
            rollupParams={rollupParams}
            setRollupParams={setRollupParams}
            rollupRangeLabel={rollupRangeLabel}
            toNumber={toNumber}
          />
        ) : null}
      </div>
    </section>
  );
};

export default PurchaseDashboardSection;
