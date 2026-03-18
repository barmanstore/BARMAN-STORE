import { BarChart2, ShoppingCart, CreditCard, TrendingUp } from 'lucide-react';
import AdminPageHeader from '../components/AdminPageHeader';
import { formatCurrency, truncateUserName } from '../../../shared/utils/formatters';
import { asNumber } from '../utils/adminHelpers';

function DailySalesSection({
  selectedDateKey,
  onDateChange,
  onRefresh,
  dailySalesLoading,
  dailySalesError,
  dailySalesSummary,
  selectedSalesBills,
}) {
  return (
    <div className="daily-sales-summary">
      <AdminPageHeader
        className="section-header"
        title="Daily Sales Summary"
        actions={(
          <div className="daily-sales-controls">
            <input
              id="daily-sales-date"
              name="daily_sales_date"
              type="date"
              className="daily-sales-date-input"
              value={selectedDateKey}
              onChange={(event) => onDateChange(String(event.target.value || '').trim())}
            />
            <button
              type="button"
              className="admin-btn"
              onClick={onRefresh}
              disabled={dailySalesLoading}
            >
              {dailySalesLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}
      />

      {dailySalesError ? <p className="daily-sales-error">{dailySalesError}</p> : null}

      <div className="stats-grid daily-sales-cards">
        <div className="stat-card">
          <BarChart2 size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.totalBilled)}</h3>
            <p>Total Billed</p>
          </div>
        </div>
        <div className="stat-card">
          <ShoppingCart size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.cashCollected)}</h3>
            <p>Cash Collected</p>
          </div>
        </div>
        <div className="stat-card">
          <CreditCard size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.creditIssued)}</h3>
            <p>Credit Issued</p>
          </div>
        </div>
        <div className="stat-card">
          <TrendingUp size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.expectedDrawerCash)}</h3>
            <p>Expected Cash In Drawer</p>
          </div>
        </div>
      </div>

      <div className="daily-sales-meta-row">
        <span>Transactions: <strong>{dailySalesSummary.txCount}</strong></span>
        <span>Paid Bills: <strong>{dailySalesSummary.paidBills}</strong></span>
        <span>Pending Bills: <strong>{dailySalesSummary.pendingBills}</strong></span>
        <span>Avg Ticket: <strong>{formatCurrency(dailySalesSummary.avgTicket)}</strong></span>
      </div>

      <div className="orders-table daily-sales-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Bill</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Credit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {selectedSalesBills.length === 0 ? (
              <tr>
                <td colSpan={7} className="orders-empty-row">No sales bills found for selected date.</td>
              </tr>
            ) : selectedSalesBills.map((bill) => (
              <tr key={bill.id}>
                <td>{new Date(bill.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{bill.bill_number || `#${bill.id}`}</td>
                <td>{truncateUserName(bill.customer_name || '-', 15)}</td>
                <td>{formatCurrency(asNumber(bill.total_amount, 0))}</td>
                <td>{formatCurrency(asNumber(bill.paid_amount, 0))}</td>
                <td>{formatCurrency(asNumber(bill.credit_amount, 0))}</td>
                <td>{String(bill.payment_status || '-').toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DailySalesSection;

