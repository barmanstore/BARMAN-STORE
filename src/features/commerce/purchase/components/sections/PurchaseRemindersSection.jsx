import { useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  CheckCheck,
  Clock,
  DollarSign,
  Eye,
  MessageCircle,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Truck,
  Wallet,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Trash2,
} from 'lucide-react';

const PurchaseRemindersSection = ({
  operationsLoading,
  operationsSummary,
  onDraftDistributor,
  onOpenOrder,
  formatCurrency,
  toNumber,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-section-header">
      <div>
        <h2>Reminders & Workflow</h2>
        <p>Monitor tomorrow reminders, urgent next actions, and distributor pattern suggestions.</p>
      </div>
      {operationsLoading ? <span className="purchase-ops-loading">Refreshing...</span> : null}
    </div>

    <div className="purchase-ops-grid">
      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <BellRing size={16} />
          <span>Tomorrow Reminders</span>
        </div>
        {operationsSummary.reminders?.length ? (
          operationsSummary.reminders.map((entry) => (
            <div key={`reminders-full-${entry.distributor_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>{entry.message}</p>
                <small>{entry.schedule_day} | {entry.reminder_for}</small>
              </div>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.suggested_next_order_date,
                  suggested_items: entry.suggested_items || [],
                })}
              >
                Draft PO
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No distributor reminder due for tomorrow.</div>
        )}
      </section>

      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Clock size={16} />
          <span>Urgent Workflow</span>
        </div>
        {operationsSummary.workflow?.length ? (
          operationsSummary.workflow.map((entry) => (
            <div key={`reminders-workflow-${entry.order_id}`} className="purchase-ops-item">
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

      <section className="purchase-ops-panel insights">
        <div className="purchase-ops-panel-title">
          <Sparkles size={16} />
          <span>Distributor Insights</span>
        </div>
        {operationsSummary.distributor_insights?.length ? (
          operationsSummary.distributor_insights.map((entry) => (
            <div key={`reminders-insight-${entry.distributor_id}`} className="purchase-insight-card">
              <strong>{entry.distributor_name}</strong>
              <span>Next order: {entry.next_order_date || '-'}</span>
              <span>Cadence: {entry.cadence_days ? `${entry.cadence_days} days` : '-'}</span>
              <span>Outstanding: {formatCurrency(toNumber(entry.outstanding_amount))}</span>
              <small>{(entry.likely_items || []).slice(0, 3).join(', ') || 'No strong pattern yet'}</small>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.next_order_date,
                  suggested_items: entry.suggested_items || [],
                })}
              >
                Smart Draft
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">Not enough history for distributor insights yet.</div>
        )}
      </section>
    </div>
  </section>
);

export default PurchaseRemindersSection;
