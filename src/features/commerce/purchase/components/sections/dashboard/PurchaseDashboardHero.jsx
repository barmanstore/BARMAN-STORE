import { BarChart3, Clock, ExternalLink, Package, Plus, RotateCcw, Truck, Wallet } from 'lucide-react';

const PurchaseDashboardHero = ({
  operationsLoading,
  operationsCardItems,
  onNewOrder,
  onOpenBrowserWorkspace,
  onOpenLedgerForm,
  onOpenReturn,
  activeSector,
  setActiveSector,
  operationsSummary,
  rollupRangeLabel,
  rollupTotals,
  formatCurrency,
  toNumber,
}) => {
  const sectorTiles = [
    {
      key: 'planning',
      label: 'Planning',
      value: `${toNumber(operationsSummary.today_distributors?.length)} today`,
      meta: `${toNumber(operationsSummary.tomorrow_distributors?.length)} tomorrow | ${toNumber(operationsSummary.weekly_distributors?.length)} week`,
      icon: Package,
    },
    {
      key: 'payments',
      label: 'Payments',
      value: formatCurrency(toNumber(operationsSummary?.cards?.payable_today_amount)),
      meta: `${toNumber(operationsSummary.payables?.length)} due | ${toNumber(operationsSummary.predicted_payments_today?.length)} predicted`,
      icon: Wallet,
    },
    {
      key: 'deliveries',
      label: 'Deliveries',
      value: `${toNumber(operationsSummary.predicted_deliveries_next?.length)} upcoming`,
      meta: `${toNumber(operationsSummary.cards?.waiting_delivery_count)} waiting now`,
      icon: Truck,
    },
    {
      key: 'workflow',
      label: 'Workflow',
      value: `${toNumber(operationsSummary.workflow?.length)} actions`,
      meta: `${toNumber(operationsSummary.cards?.waiting_bill_count)} bills | ${toNumber(operationsSummary.cards?.close_ready_count)} close ready`,
      icon: Clock,
    },
    {
      key: 'insights',
      label: 'Insights',
      value: rollupRangeLabel,
      meta: `${toNumber(rollupTotals.payment)} payments | ${toNumber(rollupTotals.po_created)} POs`,
      icon: BarChart3,
    },
  ];

  return (
    <div className="purchase-ops-hero">
      <div className="purchase-ops-header">
        <div>
          <h2>Purchase Dashboard</h2>
          <p>Plan, pay, and track every purchase action with compact, actionable panels.</p>
        </div>
        {operationsLoading && <span className="purchase-ops-loading">Refreshing...</span>}
      </div>
      <div className="purchase-ops-cards">
        {operationsCardItems.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`purchase-ops-card ${card.tone}`}>
              <div className="purchase-ops-card-head">
                <span>{card.label}</span>
                <Icon size={18} />
              </div>
              <strong>{card.value}</strong>
              <small>{card.meta}</small>
            </div>
          );
        })}
      </div>
      <div className="purchase-quick-actions">
        <button type="button" className="purchase-action-tile primary" onClick={onNewOrder}>
          <Plus size={18} />
          <span>New Purchase Order</span>
        </button>
        <button type="button" className="purchase-action-tile" onClick={onOpenBrowserWorkspace}>
          <ExternalLink size={18} />
          <span>Browser Workspace</span>
        </button>
        <button type="button" className="purchase-action-tile" onClick={onOpenLedgerForm}>
          <Wallet size={18} />
          <span>Ledger Entry</span>
        </button>
        <button type="button" className="purchase-action-tile" onClick={onOpenReturn}>
          <RotateCcw size={18} />
          <span>Return / Exchange</span>
        </button>
      </div>
      <div className="purchase-sector-tiles">
        {sectorTiles.map((tile) => {
          const Icon = tile.icon;
          const isActive = activeSector === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              className={`purchase-sector-tile ${isActive ? 'active' : ''}`}
              onClick={() => setActiveSector(tile.key)}
            >
              <div className="purchase-sector-tile-head">
                <span>{tile.label}</span>
                <Icon size={18} />
              </div>
              <strong>{tile.value}</strong>
              <small>{tile.meta}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PurchaseDashboardHero;
