import classNames from 'classnames';

import { memo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  OFFER_TYPE_META,
  buildScheduleSummary,
  buildScopeSummary,
  buildValueSummary,
  getLifecycleMeta,
  getOfferLifecycleStatus,
  normalizeText,
} from '../utils/offerManagement';

function OfferLibraryTable({
  filteredOffers,
  stats,
  tableFilter,
  tableFilters,
  onFilterChange,
  onEdit,
  onDelete,
}) {
  return (
    <section className="offer-list-card">
      <div className="offer-list-head">
        <div>
          <p className="offer-kicker">Saved Offers</p>
          <h2>Offers Library</h2>
          <p className="offer-intro">Filter by lifecycle to review live, upcoming, and expired offers quickly.</p>
        </div>
        <div className="offer-filter-row">
          {tableFilters.map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              className={`offer-filter-chip${tableFilter === filterKey ? ' is-active' : ''}`}
              onClick={() => onFilterChange(filterKey)}
            >
              <span>{filterKey === 'all' ? 'All' : filterKey.charAt(0).toUpperCase() + filterKey.slice(1)}</span>
              <strong>{stats[filterKey] || 0}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="table-container offer-table-container">
        <table className="billing-table offer-table">
          <thead>
            <tr>
              <th>Offer</th>
              <th>Scope</th>
              <th>Benefit</th>
              <th>Schedule</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredOffers.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="offer-table-empty">No offers match this filter.</div>
                </td>
              </tr>
            ) : filteredOffers.map((offer) => {
              const lifecycle = getOfferLifecycleStatus(offer);
              const lifecycleMeta = getLifecycleMeta(lifecycle);

              return (
                <tr key={offer.id} className={`offer-table-row tone-${lifecycleMeta.tone}`}>
                  <td>
                    <div className="offer-table-name">
                      <strong>{offer.name}</strong>
                      <span className="offer-type-pill">
                        {OFFER_TYPE_META[normalizeText(offer.type)]?.label || offer.type}
                      </span>
                    </div>
                  </td>
                  <td>{buildScopeSummary(offer)}</td>
                  <td>
                    <div className="offer-table-value">
                      <strong>{buildValueSummary(offer)}</strong>
                      {offer.description ? <span>{offer.description}</span> : null}
                    </div>
                  </td>
                  <td>{buildScheduleSummary(offer)}</td>
                  <td>
                    <span className={classNames('offer-status-badge', {
                      'tone-success': lifecycleMeta.tone === 'success',
                      'tone-pending': lifecycleMeta.tone === 'pending',
                      'tone-danger': lifecycleMeta.tone === 'danger',
                      'tone-muted': lifecycleMeta.tone === 'muted',
                    })}>
                      {lifecycleMeta.label}
                    </span>
                  </td>
                  <td>
                    <div className="offer-table-actions">
                      <button type="button" className="billing-secondary-btn" onClick={() => onEdit(offer)}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="delete-btn" onClick={() => onDelete(offer.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(OfferLibraryTable);
