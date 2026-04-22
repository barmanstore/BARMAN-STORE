function CreditQuickFilters({
  quickTypeFilter,
  setQuickTypeFilter,
  quickRangeFilter,
  setQuickRangeFilter,
}) {
  return (
    <div className="quick-filter-panel">
      <div className="quick-filter-group">
        <span className="quick-filter-title">Type</span>
        <div className="quick-filter-chips">
          <button
            type="button"
            className={`quick-chip ${quickTypeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setQuickTypeFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`quick-chip ${quickTypeFilter === 'given' ? 'active' : ''}`}
            onClick={() => setQuickTypeFilter('given')}
          >
            Charges
          </button>
          <button
            type="button"
            className={`quick-chip ${quickTypeFilter === 'payment' ? 'active' : ''}`}
            onClick={() => setQuickTypeFilter('payment')}
          >
            Payment
          </button>
        </div>
      </div>
      <div className="quick-filter-group">
        <span className="quick-filter-title">Range</span>
        <div className="quick-filter-chips">
          <button
            type="button"
            className={`quick-chip ${quickRangeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setQuickRangeFilter('all')}
          >
            All Time
          </button>
          <button
            type="button"
            className={`quick-chip ${quickRangeFilter === '7d' ? 'active' : ''}`}
            onClick={() => setQuickRangeFilter('7d')}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`quick-chip ${quickRangeFilter === '30d' ? 'active' : ''}`}
            onClick={() => setQuickRangeFilter('30d')}
          >
            30 Days
          </button>
          <button
            type="button"
            className={`quick-chip ${quickRangeFilter === 'this_month' ? 'active' : ''}`}
            onClick={() => setQuickRangeFilter('this_month')}
          >
            This Month
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreditQuickFilters;
