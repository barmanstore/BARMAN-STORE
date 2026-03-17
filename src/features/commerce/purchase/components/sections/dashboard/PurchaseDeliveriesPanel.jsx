import { Truck } from 'lucide-react';

const PurchaseDeliveriesPanel = ({ operationsSummary, toNumber }) => (
  <div className="purchase-sector-grid single">
    <section className="purchase-ops-panel">
      <div className="purchase-ops-panel-title">
        <Truck size={16} />
        <span>Next Deliveries</span>
      </div>
      {(operationsSummary.predicted_deliveries_next || []).length ? (
        (operationsSummary.predicted_deliveries_next || []).slice(0, 6).map((entry) => (
          <div key={`next-delivery-${entry.distributor_id}`} className="purchase-ops-item">
            <div>
              <strong>{entry.distributor_name}</strong>
              <p>ETA: {entry.next_delivery_date} | Open orders: {toNumber(entry.active_open_orders)}</p>
              <small>
                Source: {entry.next_delivery_source === 'open_order' ? 'Open order' : (entry.next_delivery_source === 'history_inferred' ? 'History inferred' : 'Unknown')}
              </small>
              <small>Predicted deliveries: {toNumber(entry.predicted_delivery_count)}</small>
            </div>
          </div>
        ))
      ) : (
        <div className="purchase-ops-empty">No delivery predictions available.</div>
      )}
    </section>
  </div>
);

export default PurchaseDeliveriesPanel;
