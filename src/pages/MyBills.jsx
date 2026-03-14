import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Receipt, RefreshCw } from 'lucide-react';
import { billingApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import MobileAccountLayout from '../components/mobile/MobileAccountLayout';
import './MyBills.css';

const getStoredUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user && typeof user === 'object' ? user : null;
  } catch (_) {
    return null;
  }
};

function MyBills() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const downloadUrl = String(
    selectedBill?.invoice_url || selectedBill?.pdf_url || selectedBill?.file_url || ''
  ).trim();

  const totalDue = useMemo(
    () => bills.reduce((sum, bill) => sum + Number(bill.credit_amount || 0), 0),
    [bills]
  );

  const loadBills = async (targetUser = user) => {
    if (!targetUser?.id) return;
    setLoading(true);
    setError('');
    try {
      const rows = await billingApi.getByUser(targetUser.id);
      setBills(Array.isArray(rows) ? rows : []);
      if (!rows?.length) setSelectedBill(null);
    } catch (err) {
      setError(err.message || 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }
    setUser(currentUser);
    loadBills(currentUser);
  }, [navigate]);

  const openBill = async (bill) => {
    if (!user?.id || !bill?.id) return;
    setDetailsLoading(true);
    setError('');
    try {
      const detailed = await billingApi.getByUserBill(user.id, bill.id);
      setSelectedBill(detailed || null);
    } catch (err) {
      setError(err.message || 'Failed to load bill details');
    } finally {
      setDetailsLoading(false);
    }
  };

  if (loading) {
    return (
      <MobileAccountLayout>
        <div className="my-bills-page">
          <div className="my-bills-loading"><RefreshCw size={20} className="spin" /> Loading bills...</div>
        </div>
      </MobileAccountLayout>
    );
  }

  return (
    <MobileAccountLayout>
      <div className="my-bills-page">
        <header className="my-bills-header">
          <h1><Receipt size={18} /> My Bills</h1>
          <p>Total due: {formatCurrency(totalDue)}</p>
        </header>

      {error ? <div className="my-bills-error">{error}</div> : null}

      {bills.length === 0 ? (
        <div className="my-bills-empty">
          <FileText size={28} />
          <p>No bills found for your account yet.</p>
        </div>
      ) : (
        <div className="my-bills-layout">
          <section className="my-bills-list">
            {bills.map((bill) => (
              <button
                type="button"
                key={bill.id}
                className={`my-bill-card ${selectedBill?.id === bill.id ? 'active' : ''}`}
                onClick={() => openBill(bill)}
              >
                <div className="my-bill-top">
                  <strong>{bill.bill_number}</strong>
                  <span className={`status ${String(bill.payment_status || 'pending').toLowerCase()}`}>
                    {bill.payment_status || 'pending'}
                  </span>
                </div>
                <div className="my-bill-meta">
                  <span>{new Date(bill.created_at || Date.now()).toLocaleDateString()}</span>
                  <span>{formatCurrency(Number(bill.total_amount || 0))}</span>
                </div>
              </button>
            ))}
          </section>

          <section className="my-bill-detail">
            {detailsLoading ? (
              <div className="my-bills-loading"><RefreshCw size={18} className="spin" /> Loading bill...</div>
            ) : !selectedBill ? (
              <div className="my-bills-empty">
                <p>Select a bill to view full details.</p>
              </div>
            ) : (
              <div className="my-bill-panel">
                <h2>{selectedBill.bill_number}</h2>
                <p>Date: {new Date(selectedBill.created_at || Date.now()).toLocaleString()}</p>
                <p>Payment: {selectedBill.payment_method || 'cash'}</p>
                <p>Status: {selectedBill.payment_status || 'pending'}</p>
                {downloadUrl ? (
                  <a className="my-bill-download" href={downloadUrl} target="_blank" rel="noreferrer">
                    View / Download Bill
                  </a>
                ) : null}
                <div className="my-bill-summary">
                  <span>Total</span>
                  <strong>{formatCurrency(Number(selectedBill.total_amount || 0))}</strong>
                </div>
                <div className="my-bill-summary">
                  <span>Paid</span>
                  <strong>{formatCurrency(Number(selectedBill.paid_amount || 0))}</strong>
                </div>
                <div className="my-bill-summary">
                  <span>Credit</span>
                  <strong>{formatCurrency(Number(selectedBill.credit_amount || 0))}</strong>
                </div>

                <h3>Items</h3>
                <div className="my-bill-items">
                  {(selectedBill.items || []).map((item) => (
                    <div key={item.id} className="my-bill-item">
                      <span>{item.product_name}</span>
                      <span>{item.qty} x {formatCurrency(Number(item.mrp || 0))}</span>
                      <strong>{formatCurrency(Number(item.amount || 0))}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      </div>
    </MobileAccountLayout>
  );
}

export default MyBills;

