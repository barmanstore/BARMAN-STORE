import { Clock } from 'lucide-react';

const PurchaseWorkflowPanel = ({ operationsSummary, onOpenOrder }) => (
  <div className="purchase-sector-grid single">
    <section className="purchase-ops-panel">
      <div className="purchase-ops-panel-title">
        <Clock size={16} />
        <span>Next Actions</span>
      </div>
      {operationsSummary.workflow?.length ? (
        operationsSummary.workflow.slice(0, 5).map((entry) => (
          <div key={`workflow-${entry.order_id}`} className="purchase-ops-item">
            <div>
              <strong>{entry.po_number}</strong>
              <p>{entry.distributor_name}</p>
              <small>{entry.next_action}</small>
            </div>
            <button type="button" className="admin-btn secondary small" onClick={() => onOpenOrder(entry.order_id)}>
              Open
            </button>
          </div>
        ))
      ) : (
        <div className="purchase-ops-empty">No urgent workflow items.</div>
      )}
    </section>
  </div>
);

export default PurchaseWorkflowPanel;
