import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { creditApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import './CreditAgingReport.css';

function CreditAgingReport({ user }) {
  const [report, setReport] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAgingReport();
  }, []);

  const fetchAgingReport = async () => {
    try {
      setLoading(true);
      const data = await creditApi.getAgingReport();
      setReport(data.report || []);
      setSummary(data.summary || {});
    } catch (err) {
      setError('Failed to load credit aging report');
    } finally {
      setLoading(false);
    }
  };

  const getCreditStatus = (customer) => {
    const limit = customer.credit_limit || 0;
    const balance = customer.current_balance || 0;
    const utilization = limit > 0 ? (balance / limit) * 100 : 0;

    if (balance > limit) {
      return { status: 'over_limit', label: 'Over Limit', icon: AlertTriangle, class: 'over-limit' };
    }
    if (utilization >= 80) {
      return { status: 'high', label: 'High Risk', icon: AlertCircle, class: 'high-risk' };
    }
    if (utilization >= 50) {
      return { status: 'medium', label: 'Medium', icon: Clock, class: 'medium' };
    }
    return { status: 'low', label: 'Good', icon: CheckCircle, class: 'good' };
  };

  if (loading) {
    return (
      <div className="credit-aging-report">
        <div className="loading">Loading credit aging report...</div>
      </div>
    );
  }

  return (
    <div className="credit-aging-report">
      <div className="page-header">
        <h1>Credit Aging Report</h1>
        <button className="refresh-btn" onClick={fetchAgingReport}>
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card total">
          <span className="card-value">{formatCurrency(summary.total_outstanding || 0)}</span>
          <span className="card-label">Total Outstanding</span>
        </div>
        <div className="summary-card overdue">
          <span className="card-value">{summary.customers_overdue || 0}</span>
          <span className="card-label">Customers Overdue</span>
        </div>
        <div className="summary-card aging-0-30">
          <span className="card-value">{formatCurrency(summary.aging_0_30 || 0)}</span>
          <span className="card-label">0-30 Days</span>
        </div>
        <div className="summary-card aging-31-60">
          <span className="card-value">{formatCurrency(summary.aging_31_60 || 0)}</span>
          <span className="card-label">31-60 Days</span>
        </div>
        <div className="summary-card aging-61-90">
          <span className="card-value">{formatCurrency(summary.aging_61_90 || 0)}</span>
          <span className="card-label">61-90 Days</span>
        </div>
        <div className="summary-card aging-over-90">
          <span className="card-value">{formatCurrency(summary.aging_over_90 || 0)}</span>
          <span className="card-label">Over 90 Days</span>
        </div>
      </div>

      {/* Aging Breakdown Chart */}
      <div className="aging-chart">
        <h3>Outstanding by Aging Period</h3>
        <div className="chart-bars">
          <div className="chart-bar" style={{ width: '40%' }}>
            <div className="bar-fill days-0-30" style={{ width: '100%' }}></div>
            <span className="bar-label">0-30 Days</span>
            <span className="bar-value">{formatCurrency(summary.aging_0_30 || 0)}</span>
          </div>
          <div className="chart-bar" style={{ width: '30%' }}>
            <div className="bar-fill days-31-60" style={{ width: '100%' }}></div>
            <span className="bar-label">31-60 Days</span>
            <span className="bar-value">{formatCurrency(summary.aging_31_60 || 0)}</span>
          </div>
          <div className="chart-bar" style={{ width: '20%' }}>
            <div className="bar-fill days-61-90" style={{ width: '100%' }}></div>
            <span className="bar-label">61-90 Days</span>
            <span className="bar-value">{formatCurrency(summary.aging_61_90 || 0)}</span>
          </div>
          <div className="chart-bar" style={{ width: '10%' }}>
            <div className="bar-fill days-over-90" style={{ width: '100%' }}></div>
            <span className="bar-label">90+ Days</span>
            <span className="bar-value">{formatCurrency(summary.aging_over_90 || 0)}</span>
          </div>
        </div>
      </div>

      {/* Customer Details Table */}
      <div className="report-table-container">
        <h3>Customer Credit Details</h3>
        {report.length === 0 ? (
          <div className="empty-state">
            <p>No customers with outstanding credit balance.</p>
          </div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Credit Limit</th>
                <th>Current Balance</th>
                <th>Utilization</th>
                <th>0-30 Days</th>
                <th>31-60 Days</th>
                <th>61-90 Days</th>
                <th>90+ Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.map(customer => {
                const creditStatus = getCreditStatus(customer);
                const limit = customer.credit_limit || 0;
                const balance = customer.current_balance || 0;
                const utilization = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0;

                return (
                  <tr key={customer.customer_id}>
                    <td>
                      <span className="customer-name">{customer.customer_name}</span>
                    </td>
                    <td>
                      <div className="contact-info">
                        <span>{customer.phone || '-'}</span>
                        <span className="email">{customer.email || '-'}</span>
                      </div>
                    </td>
                    <td>{formatCurrency(limit)}</td>
                    <td className="balance">
                      <strong>{formatCurrency(balance)}</strong>
                    </td>
                    <td>
                      <div className="utilization-bar">
                        <div 
                          className={`bar ${creditStatus.status}`}
                          style={{ width: `${utilization}%` }}
                        ></div>
                        <span>{utilization.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="aging-amount">{formatCurrency(customer.days_0_30)}</td>
                    <td className={`aging-amount ${customer.days_31_60 > 0 ? 'overdue' : ''}`}>
                      {formatCurrency(customer.days_31_60)}
                    </td>
                    <td className={`aging-amount ${customer.days_61_90 > 0 ? 'overdue' : ''}`}>
                      {formatCurrency(customer.days_61_90)}
                    </td>
                    <td className={`aging-amount ${customer.days_over_90 > 0 ? 'critical' : ''}`}>
                      {formatCurrency(customer.days_over_90)}
                    </td>
                    <td>
                      <span className={`status-badge ${creditStatus.class}`}>
                        <creditStatus.icon size={14} />
                        {creditStatus.label}
                      </span>
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
