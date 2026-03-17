import AppModal from '../../../components/AppModal';
import { truncateUserName } from '../../../utils/formatters';

const AdminApproveModal = ({
  showApproveModal,
  modalOrder,
  modalItems,
  modalLoading,
  onClose,
  confirmApprove,
  proceedBillingOrderId,
  handleProceedToBilling,
}) => {
  if (!showApproveModal || !modalOrder) return null;

  return (
    <AppModal
      open={showApproveModal}
      title={`Mark Received ${modalOrder.order_number || `#${modalOrder.id}`}`}
      onClose={onClose}
    >
      {modalLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <p>Customer: {truncateUserName(modalOrder.customer_name || '-', 15)} ({modalOrder.customer_email})</p>
          <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {modalItems.map(it => (
                  <tr key={it.id}>
                    <td style={{ padding: 6 }}>{it.product_name || it.name}</td>
                    <td style={{ padding: 6 }}>{it.quantity}</td>
                    <td style={{ padding: 6 }}>
                      {it.stock !== undefined ? it.stock : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="admin-btn" onClick={onClose} disabled={modalLoading}>Close</button>
            {!(Number(modalOrder?.bill_id || 0) || String(modalOrder?.linked_bill_number || '').trim()) ? (
              <button
                className="admin-btn"
                onClick={() => handleProceedToBilling(modalOrder)}
                disabled={modalLoading || proceedBillingOrderId === Number(modalOrder?.id || 0)}
              >
                {proceedBillingOrderId === Number(modalOrder?.id || 0)
                  ? 'Opening...'
                  : String(modalOrder?.status || '').toLowerCase() === 'ordered'
                    ? 'Confirm + Billing'
                    : 'Proceed Billing'}
              </button>
            ) : (
              <span style={{ opacity: 0.75, alignSelf: 'center' }}>
                Bill: {modalOrder?.linked_bill_number || `#${modalOrder?.bill_id}`}
              </span>
            )}
            <button className="admin-btn primary" onClick={confirmApprove} disabled={modalLoading}>Confirm Received</button>
          </div>
        </>
      )}
    </AppModal>
  );
};

export default AdminApproveModal;
