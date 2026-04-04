import { useMemo, useState } from 'react';
import { AlertTriangle, BellRing, Package, Truck } from 'lucide-react';
import { sortPurchaseAnalyticsEntries } from '../../../utils/purchaseAnalyticsSort';

const PurchasePlanningPanel = ({
  operationsSummary,
  lowStockProducts,
  onDraftDistributor,
  onNewOrder,
  formatCurrency,
  toNumber,
}) => {
  const [todaySort, setTodaySort] = useState('overdue_desc');
  const [tomorrowSort, setTomorrowSort] = useState('balance_desc');
  const [weeklySort, setWeeklySort] = useState('date_asc');

  const todayEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.today_distributors || [], todaySort),
    [operationsSummary.today_distributors, todaySort]
  );
  const tomorrowEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.tomorrow_distributors || [], tomorrowSort),
    [operationsSummary.tomorrow_distributors, tomorrowSort]
  );
  const weeklyEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.weekly_distributors || [], weeklySort),
    [operationsSummary.weekly_distributors, weeklySort]
  );

  const renderSort = (value, onChange) => (
    <select name="purchase_section_sort" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Sort section">
      <option value="balance_desc">Highest balance</option>
      <option value="overdue_desc">Most overdue</option>
      <option value="date_asc">Earliest date</option>
      <option value="ledger_desc">Highest ledger</option>
      <option value="name_asc">Name A-Z</option>
    </select>
  );

  const getSuggestedItems = (entry) => {
    const list = Array.isArray(entry?.suggested_items) ? entry.suggested_items : [];
    const names = list
      .map((item) => String(item?.product_name || item?.name || '').trim())
      .filter(Boolean);
    return names.slice(0, 3);
  };

  const renderNoveltyAlert = (entry) => {
    const alerts = Array.isArray(entry?.novelty_alerts) ? entry.novelty_alerts : [];
    const totalCount = Math.max(0, Number(entry?.novelty_summary?.total_count || alerts.length || 0));
    if (!totalCount) return null;
    const preview = alerts
      .slice(0, 2)
      .map((item) => String(item?.item_name || '').trim())
      .filter(Boolean)
      .join(', ');
    const label = alerts[0]?.label || 'Check supplier novelty';
    const remainder = totalCount > 2 ? ` +${totalCount - 2} more` : '';
    return (
      <small className="purchase-ops-novelty">
        <AlertTriangle size={12} />
        <span>{label}: {preview || `${totalCount} item${totalCount === 1 ? '' : 's'}`}{remainder}</span>
      </small>
    );
  };

  return (
    <div className="purchase-sector-grid">
      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Truck size={16} />
          <span>Today Order Day</span>
        </div>
        {renderSort(todaySort, setTodaySort)}
        {todayEntries.length ? (
          todayEntries.slice(0, 6).map((entry) => (
            <div key={`today-${entry.distributor_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</p>
                {getSuggestedItems(entry).length ? (
                  <small>Suggested: {getSuggestedItems(entry).join(', ')}</small>
                ) : null}
                {renderNoveltyAlert(entry)}
                <small>
                  Due today: {formatCurrency(toNumber(entry.due_today_amount))} | Overdue: {formatCurrency(toNumber(entry.overdue_amount))}
                </small>
                <small>
                  PO: {formatCurrency(toNumber(entry.po_balance_due))} | Ledger: {formatCurrency(toNumber(entry.ledger_balance))}
                </small>
              </div>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.schedule_date,
                  suggested_items: entry.suggested_items || [],
                })}
              >
                Draft PO
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No distributor is scheduled on order day today.</div>
        )}
      </section>

      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <BellRing size={16} />
          <span>Tomorrow PO Prep</span>
        </div>
        {renderSort(tomorrowSort, setTomorrowSort)}
        {tomorrowEntries.length ? (
          tomorrowEntries.slice(0, 6).map((entry) => (
            <div key={`tomorrow-${entry.distributor_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</p>
                {getSuggestedItems(entry).length ? (
                  <small>Suggested: {getSuggestedItems(entry).join(', ')}</small>
                ) : null}
                {renderNoveltyAlert(entry)}
                <small>{entry.schedule_day} | {entry.schedule_date}</small>
                <small>Configured: {entry.configured_payment_due_days ?? '-'}d | Inferred: {entry.inferred_payment_due_days ?? '-'}d</small>
              </div>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.schedule_date,
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
          <Package size={16} />
          <span>Weekly Schedule</span>
        </div>
        {renderSort(weeklySort, setWeeklySort)}
        {weeklyEntries.length ? (
          weeklyEntries.slice(0, 8).map((entry) => (
            <div key={`weekly-${entry.distributor_id}-${entry.schedule_date}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>{entry.schedule_day} | {entry.schedule_date}</p>
                <small>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</small>
                {getSuggestedItems(entry).length ? (
                  <small>Suggested: {getSuggestedItems(entry).join(', ')}</small>
                ) : null}
                {renderNoveltyAlert(entry)}
              </div>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onDraftDistributor(entry.distributor_id, {
                  expected_delivery: entry.schedule_date,
                  suggested_items: entry.suggested_items || [],
                })}
              >
                Draft
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No weekly schedule is available.</div>
        )}
      </section>

      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Package size={16} />
          <span>Short Items (Low Stock)</span>
        </div>
        {Array.isArray(lowStockProducts) && lowStockProducts.length ? (
          lowStockProducts.slice(0, 8).map((product) => (
            <div key={`short-${product.id}`} className="purchase-ops-item">
              <div>
                <strong>{product.name || 'Item'}</strong>
                <p>Stock: {toNumber(product.stock)}</p>
                <small>{product.category || product.brand || ''}</small>
              </div>
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => onNewOrder?.()}
              >
                Draft PO
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No low stock items detected.</div>
        )}
      </section>
    </div>
  );
};

export default PurchasePlanningPanel;
