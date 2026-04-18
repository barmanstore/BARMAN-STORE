import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { creditApi } from '../../../shared/services/api';
import { formatCurrency } from '../../../shared/utils/formatters';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import EmptyState from '../../../shared/components/EmptyState';
import scoreBands from '../../../../shared/creditScoreBands.json';
import './CreditAgingReport.css';

function CreditAgingReport() {
  const [report, setReport] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncState, setSyncState] = useState('');
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    badge: null,
    agingBucket: null,
    risk: null,
    defaulter: false,
    followUp: false,
  });
  const [sort, setSort] = useState({ key: null, direction: 'desc' });

  useEffect(() => {
    fetchAgingReport();
  }, []);

  const fetchAgingReport = async () => {
    try {
      setLoading(true);
      setError('');
      setSyncState('');
      const data = await creditApi.getAgingReport();
      setReport(data.report || []);
      setSummary(data.summary || {});
    } catch (err) {
      if (
        Number(err?.status || 0) === 503 &&
        String(err?.payload?.status || '')
          .trim()
          .toLowerCase() === 'initializing'
      ) {
        setReport([]);
        setSummary({});
        setSyncState('initializing');
        setError('');
        return;
      }
      setError('Failed to load credit aging report');
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatus = (customer) => {
    const status = String(customer?.payment_status || '')
      .trim()
      .toLowerCase();
    if (status === 'new') {
      return { label: 'New', icon: Clock, className: 'new' };
    }
    if (status === 'excellent') {
      return { label: 'Excellent', icon: CheckCircle, className: 'excellent' };
    }
    if (status === 'very_good') {
      return { label: 'Very Good', icon: CheckCircle, className: 'very-good' };
    }
    if (status === 'good') {
      return { label: 'Good', icon: Clock, className: 'good' };
    }
    if (status === 'average') {
      return { label: 'Average', icon: Clock, className: 'good' };
    }
    if (status === 'needs_attention') {
      return { label: 'Needs Attention', icon: AlertCircle, className: 'attention' };
    }
    if (status === 'defaulter') {
      return { label: 'Defaulter', icon: AlertTriangle, className: 'problem' };
    }
    return { label: 'Problem', icon: AlertTriangle, className: 'problem' };
  };

  const getScoreBand = (score) => {
    const numeric = Math.min(100, Math.max(0, Math.round(Number(score || 0))));
    const bands = Array.isArray(scoreBands) ? scoreBands : [];
    return bands.find((band) => numeric >= band.min) || bands[bands.length - 1] || null;
  };

  const getPaymentHealth = () => {
    const avgScore = Number(summary.average_payment_score || 0);
    if (!Number.isFinite(avgScore)) return { label: 'No score yet', tone: 'neutral', score: null };
    const band = getScoreBand(avgScore);
    return {
      label: band?.label || 'No score yet',
      tone: band?.tone || 'neutral',
      score: avgScore,
    };
  };

  const getLimitStatus = (customer) => {
    const limit = Number(customer?.credit_limit || 0);
    const balance = Number(customer?.current_balance || 0);
    if (limit <= 0) {
      return { label: 'No Limit', className: 'not-set' };
    }
    if (balance > limit) {
      return { label: 'Over Limit', className: 'over-limit' };
    }
    return { label: 'Within Limit', className: 'within-limit' };
  };

  const getRiskLabel = (bucketKey) => {
    if (bucketKey === 'aging_0_30') return { label: 'Low Risk', tone: 'low' };
    if (bucketKey === 'aging_31_60') return { label: 'Medium Risk', tone: 'medium' };
    return { label: 'High Risk', tone: 'high' };
  };

  const handleFilterToggle = (next) => {
    setFilters((current) => ({ ...current, ...next }));
  };

  const clearFilters = () => {
    setFilters({
      badge: null,
      agingBucket: null,
      risk: null,
      defaulter: false,
      followUp: false,
    });
  };

  const removeFilter = (key) => {
    if (key === 'defaulter' || key === 'followUp') {
      handleFilterToggle({ [key]: false });
      return;
    }
    handleFilterToggle({ [key]: null });
  };

  const matchesFollowUp = (row) => {
    const status = String(row.payment_status || '')
      .trim()
      .toLowerCase();
    return (
      Boolean(row.is_defaulter) ||
      Number(row.missed_periods || 0) > 0 ||
      Number(row.days_31_60 || 0) > 0 ||
      Number(row.days_61_90 || 0) > 0 ||
      Number(row.days_over_90 || 0) > 0 ||
      status === 'needs_attention' ||
      status === 'problem' ||
      status === 'defaulter'
    );
  };

  const matchesRisk = (row, risk) => {
    if (!risk) return true;
    const has31 = Number(row.days_31_60 || 0) > 0;
    const has61 = Number(row.days_61_90 || 0) > 0;
    const has90 = Number(row.days_over_90 || 0) > 0;
    if (risk === 'low') return !has31 && !has61 && !has90;
    if (risk === 'medium') return has31 && !has61 && !has90;
    return has61 || has90;
  };

  const matchesBucket = (row, bucketKey) => {
    if (!bucketKey) return true;
    if (bucketKey === 'aging_over_90') return Number(row.days_over_90 || 0) > 0;
    return Number(row[bucketKey] || 0) > 0;
  };

  const filteredReport = report.filter((row) => {
    const status = String(row.payment_status || '')
      .trim()
      .toLowerCase();
    const isNew =
      String(row.customer_tag || '')
        .trim()
        .toLowerCase() === 'insufficient_history' || status === 'new';
    if (filters.badge) {
      if (filters.badge === 'new' && !isNew) return false;
      if (filters.badge !== 'new' && status !== filters.badge) return false;
    }
    if (filters.defaulter && !row.is_defaulter) return false;
    if (filters.followUp && !matchesFollowUp(row)) return false;
    if (!matchesRisk(row, filters.risk)) return false;
    if (!matchesBucket(row, filters.agingBucket)) return false;
    return true;
  });

  const toggleSort = (key) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const getBadgeRank = (row) => {
    const status = String(row.payment_status || '')
      .trim()
      .toLowerCase();
    if (status === 'new') return -1;
    const score = Number(row.payment_score || 0);
    return Number.isFinite(score) ? score : 0;
  };

  const getAgingRank = (row) => {
    const has90 = Number(row.days_over_90 || 0) > 0;
    const has61 = Number(row.days_61_90 || 0) > 0;
    const has31 = Number(row.days_31_60 || 0) > 0;
    if (has90 || has61) return 3;
    if (has31) return 2;
    if (Number(row.days_0_30 || 0) > 0) return 1;
    return 0;
  };

  const sortedReport = (() => {
    if (!sort.key) return filteredReport;
    const direction = sort.direction === 'desc' ? -1 : 1;
    return filteredReport
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        let value = 0;
        if (sort.key === 'customer') {
          value = String(a.row.customer_name || '').localeCompare(
            String(b.row.customer_name || '')
          );
        } else if (sort.key === 'outstanding') {
          value = Number(a.row.current_balance || 0) - Number(b.row.current_balance || 0);
        } else if (sort.key === 'aging') {
          value = getAgingRank(a.row) - getAgingRank(b.row);
        } else if (sort.key === 'badge') {
          value = getBadgeRank(a.row) - getBadgeRank(b.row);
        }
        if (value === 0) return a.index - b.index;
        return value * direction;
      })
      .map((item) => item.row);
  })();

  const agingSeries = [
    {
      key: 'aging_0_30',
      label: '0-30 Days',
      className: 'days-0-30',
      value: Number(summary.aging_0_30 || 0),
    },
    {
      key: 'aging_31_60',
      label: '31-60 Days',
      className: 'days-31-60',
      value: Number(summary.aging_31_60 || 0),
    },
    {
      key: 'aging_61_90',
      label: '61-90 Days',
      className: 'days-61-90',
      value: Number(summary.aging_61_90 || 0),
    },
    {
      key: 'aging_over_90',
      label: '90+ Days',
      className: 'days-over-90',
      value: Number(summary.aging_over_90 || 0),
    },
  ];
  const maxAgingAmount = Math.max(1, ...agingSeries.map((entry) => entry.value));
  const paymentHealth = getPaymentHealth();
  const hasFilters = Boolean(
    filters.badge || filters.agingBucket || filters.risk || filters.defaulter || filters.followUp
  );
  const badgeBreakdown = [
    {
      key: 'excellent',
      label: 'Excellent',
      tone: 'excellent',
      count: Number(summary?.badge_counts?.excellent || 0),
    },
    {
      key: 'very_good',
      label: 'Very Good',
      tone: 'very-good',
      count: Number(summary?.badge_counts?.very_good || 0),
    },
    { key: 'good', label: 'Good', tone: 'good', count: Number(summary?.badge_counts?.good || 0) },
    {
      key: 'average',
      label: 'Average',
      tone: 'good',
      count: Number(summary?.badge_counts?.average || 0),
    },
    {
      key: 'needs_attention',
      label: 'Needs Attention',
      tone: 'attention',
      count: Number(summary?.badge_counts?.needs_attention || 0),
    },
    {
      key: 'problem',
      label: 'Problem',
      tone: 'problem',
      count: Number(summary?.badge_counts?.problem || 0),
    },
    {
      key: 'defaulter',
      label: 'Defaulter',
      tone: 'problem',
      count: Number(summary?.badge_counts?.defaulter || 0),
    },
    { key: 'new', label: 'New', tone: 'new', count: Number(summary?.customers_new || 0) },
  ];
  const activeFilters = [
    filters.badge
      ? {
          key: 'badge',
          label: `Badge: ${badgeBreakdown.find((b) => b.key === filters.badge)?.label || filters.badge}`,
        }
      : null,
    filters.risk
      ? {
          key: 'risk',
          label: `Risk: ${filters.risk === 'low' ? 'Low' : filters.risk === 'medium' ? 'Medium' : 'High'}`,
        }
      : null,
    filters.agingBucket
      ? {
          key: 'agingBucket',
          label: `Aging: ${agingSeries.find((b) => b.key === filters.agingBucket)?.label || filters.agingBucket}`,
        }
      : null,
    filters.defaulter ? { key: 'defaulter', label: 'Defaulter' } : null,
    filters.followUp ? { key: 'followUp', label: 'Follow Up' } : null,
  ].filter(Boolean);

  if (loading) {
    return (
      <div className="credit-aging-report">
        <div className="loading">Loading credit aging report...</div>
      </div>
    );
  }

  return (
    <div className="credit-aging-report">
      <BackofficePageHeader
        className="page-header"
        title="Credit Aging Report"
        actions={
          <div className="page-header-actions">
            <button className="refresh-btn" onClick={fetchAgingReport}>
              <RefreshCw size={18} /> Refresh
            </button>
            <button
              type="button"
              className={`reset-filters-btn ${hasFilters ? 'active' : ''}`}
              onClick={clearFilters}
            >
              Reset Filters
            </button>
          </div>
        }
      />

      {error && <div className="error-message">{error}</div>}
      {!error && syncState === 'initializing' ? (
        <div className="success-message">
          Credit aging is updating. Refresh after the snapshot rebuild completes.
        </div>
      ) : null}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card total">
          <span className="card-value">{formatCurrency(summary.total_outstanding || 0)}</span>
          <span className="card-label">Total Outstanding</span>
        </div>
        <button
          type="button"
          className={`summary-card score card-action ${paymentHealth.tone}`}
          onClick={() => handleFilterToggle({ badge: null, defaulter: false, followUp: false })}
        >
          <span className="card-value">{paymentHealth.label}</span>
          <span className="card-label">
            {Number.isFinite(paymentHealth.score)
              ? `${paymentHealth.score.toFixed(1)} / 100`
              : 'Payment Health'}
          </span>
        </button>
        <button
          type="button"
          className="summary-card overdue card-action"
          onClick={() => handleFilterToggle({ defaulter: true, followUp: false })}
        >
          <span className="card-value">{summary.customers_defaulters || 0}</span>
          <span className="card-label">Defaulters</span>
        </button>
        <button
          type="button"
          className="summary-card follow-up card-action"
          onClick={() => handleFilterToggle({ followUp: true, defaulter: false })}
        >
          <span className="card-value">{summary.customers_need_follow_up || 0}</span>
          <span className="card-label">Need Follow-Up</span>
        </button>
        <button
          type="button"
          className="summary-card limit card-action"
          onClick={() => handleFilterToggle({ badge: null, defaulter: false, followUp: false })}
        >
          <span className="card-value">{summary.customers_over_limit || 0}</span>
          <span className="card-label">Over Credit Limit</span>
        </button>
      </div>

      {hasFilters ? (
        <div className="filter-summary">
          <div className="filter-chips">
            {activeFilters.map((filter) => (
              <span key={filter.key} className="filter-chip">
                {filter.label}
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => removeFilter(filter.key)}
                >
                  ✖
                </button>
              </span>
            ))}
          </div>
          <button type="button" className="clear-filters" onClick={clearFilters}>
            Clear
          </button>
        </div>
      ) : null}

      <div className="health-breakdown">
        <div className="health-header">
          <h3>Customer Health</h3>
          {hasFilters ? (
            <button type="button" className="clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="health-grid">
          {badgeBreakdown.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`health-card ${entry.tone} ${filters.badge === entry.key ? 'active' : ''}`}
              onClick={() =>
                handleFilterToggle({ badge: entry.key, defaulter: false, followUp: false })
              }
            >
              <span className="health-count">{entry.count}</span>
              <span className="health-label">{entry.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Aging Breakdown Chart */}
      <div className="aging-chart">
        <h3>Outstanding by Aging Period</h3>
        <div className="chart-bars">
          {agingSeries.map((entry) => {
            const risk = getRiskLabel(entry.key);
            const isActive = filters.agingBucket === entry.key || filters.risk === risk.tone;
            return (
              <button
                type="button"
                className={`chart-bar card-action ${isActive ? 'active' : ''}`}
                key={entry.key}
                onClick={() => handleFilterToggle({ agingBucket: entry.key, risk: risk.tone })}
              >
                <div
                  className={`bar-fill ${entry.className}`}
                  style={{
                    width: `${entry.value > 0 ? Math.max((entry.value / maxAgingAmount) * 100, 10) : 0}%`,
                  }}
                />
                <span className="bar-label">{entry.label}</span>
                <span className={`bar-risk ${risk.tone}`}>{risk.label}</span>
                <span className="bar-value">{formatCurrency(entry.value)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Customer Details Table */}
      <div className="report-table-container">
        <h3>Customer Credit Details</h3>
        {filteredReport.length === 0 ? (
          <EmptyState
            title="No customer rows"
            description={
              syncState === 'initializing'
                ? 'Credit aging is updating from the latest ledger activity.'
                : hasFilters
                  ? 'No customers match the current filters.'
                  : 'No customers with outstanding credit balance.'
            }
          />
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="sort-btn" onClick={() => toggleSort('customer')}>
                    Customer
                    <span className={`sort-indicator ${sort.key === 'customer' ? 'active' : ''}`}>
                      {sort.key === 'customer' && sort.direction === 'desc' ? '▼' : '▲'}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="sort-btn"
                    onClick={() => toggleSort('outstanding')}
                  >
                    Outstanding
                    <span
                      className={`sort-indicator ${sort.key === 'outstanding' ? 'active' : ''}`}
                    >
                      {sort.key === 'outstanding' && sort.direction === 'desc' ? '▼' : '▲'}
                    </span>
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-btn" onClick={() => toggleSort('aging')}>
                    Aging
                    <span className={`sort-indicator ${sort.key === 'aging' ? 'active' : ''}`}>
                      {sort.key === 'aging' && sort.direction === 'desc' ? '▼' : '▲'}
                    </span>
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-btn" onClick={() => toggleSort('badge')}>
                    Badge
                    <span className={`sort-indicator ${sort.key === 'badge' ? 'active' : ''}`}>
                      {sort.key === 'badge' && sort.direction === 'desc' ? '▼' : '▲'}
                    </span>
                  </button>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedReport.map((customer) => {
                const paymentStatus = getPaymentStatus(customer);
                const limitStatus = getLimitStatus(customer);
                const limit = Number(customer.credit_limit || 0);
                const balance = Number(customer.current_balance || 0);
                const utilization = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0;
                const isNew =
                  String(customer.customer_tag || '')
                    .trim()
                    .toLowerCase() === 'insufficient_history' ||
                  String(customer.payment_status || '')
                    .trim()
                    .toLowerCase() === 'new';
                const hasPaymentScore =
                  !isNew &&
                  customer.payment_score !== null &&
                  customer.payment_score !== undefined &&
                  Number.isFinite(Number(customer.payment_score));
                const paymentScore = hasPaymentScore ? Number(customer.payment_score) : null;
                const statusTag = String(customer.payment_status_tag || '').trim();
                const hasStatusTag = Boolean(statusTag);
                const showDefaulter = Boolean(customer.is_defaulter);
                const showFollowUp = matchesFollowUp(customer);
                const showInactive = !customer.is_active;
                const showOverLimit =
                  String(customer.limit_status || '')
                    .trim()
                    .toLowerCase() === 'over_limit';
                const agingLabel =
                  customer.days_over_90 > 0
                    ? '90+ Days'
                    : customer.days_61_90 > 0
                      ? '61-90 Days'
                      : customer.days_31_60 > 0
                        ? '31-60 Days'
                        : customer.days_0_30 > 0
                          ? '0-30 Days'
                          : 'Current';
                const agingRisk =
                  customer.days_over_90 > 0 || customer.days_61_90 > 0
                    ? 'High Risk'
                    : customer.days_31_60 > 0
                      ? 'Medium Risk'
                      : 'Low Risk';

                return (
                  <tr key={customer.customer_id}>
                    <td>
                      <div className="customer-name-stack">
                        <span className="customer-name">{customer.customer_name}</span>
                        {customer.summary_line ? (
                          <span className="customer-summary-note">{customer.summary_line}</span>
                        ) : null}
                        <div className="contact-info">
                          <span>{customer.phone || '-'}</span>
                          <span className="email">{customer.email || '-'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="balance">
                      <strong>{formatCurrency(balance)}</strong>
                      <span className={`limit-pill ${limitStatus.className}`}>
                        {limitStatus.label}
                      </span>
                      {limit > 0 ? (
                        <span className="utilization-note">{utilization.toFixed(1)}% used</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="aging-stack">
                        <strong>{agingLabel}</strong>
                        <span
                          className={`risk-pill ${agingRisk === 'High Risk' ? 'high' : agingRisk === 'Medium Risk' ? 'medium' : 'low'}`}
                        >
                          {agingRisk}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${paymentStatus.className}`}>
                        <paymentStatus.icon size={14} />
                        {paymentStatus.label}
                      </span>
                      {hasPaymentScore ? (
                        <span className="badge-score">{Math.round(paymentScore)}/100</span>
                      ) : (
                        <span className="badge-score">{isNew ? 'Insufficient history' : '-'}</span>
                      )}
                      {hasStatusTag ? <span className="status-tag">{statusTag}</span> : null}
                    </td>
                    <td>
                      <div className="action-flags">
                        <button
                          type="button"
                          className="row-action view"
                          onClick={() => navigate(`/admin/users/${customer.customer_id}/credit`)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="row-action follow-up"
                          onClick={() =>
                            navigate(`/admin/users/${customer.customer_id}/credit?follow_up=1`)
                          }
                        >
                          Follow Up
                        </button>
                        {showDefaulter ? <span className="flag defaulter">Defaulter</span> : null}
                        {showFollowUp ? <span className="flag follow-up">Follow Up</span> : null}
                        {showOverLimit ? <span className="flag over-limit">Over Limit</span> : null}
                        {showInactive ? <span className="flag inactive">Inactive</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default CreditAgingReport;
