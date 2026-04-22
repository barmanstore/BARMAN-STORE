import { useCallback } from 'react';
import { DOMAINS, invalidateDomain } from '../../../../shared/services/invalidation';
import formatApiError from '../../../../shared/utils/formatApiError';

const usePurchaseStatusHandlers = ({
  purchaseOrdersApi,
  fetchOrders,
  fetchDistributorLedger,
  setError,
  setSuccess,
  setSendingWhatsAppOrderId,
}) => {
  const handleUpdateStatus = useCallback(
    async (orderId, status, extra = {}) => {
      try {
        setError('');
        const normalizedStatus = String(status || '')
          .trim()
          .toLowerCase();
        const statusResult =
          normalizedStatus === 'processed'
            ? await purchaseOrdersApi.confirmPO(orderId, extra)
            : await purchaseOrdersApi.updateStatus(orderId, status, extra);
        if (normalizedStatus === 'processed' && Number(statusResult?.cap_applied_count || 0) > 0) {
          const lines = (statusResult.cap_adjustments || []).slice(0, 5).map((row) => {
            const name = String(row?.product_name || row?.product_id || 'Product');
            return `- ${name}: final stock ${row?.final_stock}`;
          });
          const moreCount = Math.max(0, Number(statusResult.cap_applied_count || 0) - lines.length);
          const moreText = moreCount > 0 ? `\n...and ${moreCount} more item(s)` : '';
          setSuccess(
            `Stock cap (${Number(statusResult?.stock_cap || 50)}) was applied to ${statusResult.cap_applied_count} item(s).\n\n${lines.join('\n')}${moreText}`
          );
        }
        await fetchOrders();
        await fetchDistributorLedger();
        await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
        if (normalizedStatus === 'processed') {
          await invalidateDomain(DOMAINS.Products, { sourceId: 'purchase-orders' });
          await invalidateDomain(DOMAINS.Stock, { sourceId: 'purchase-orders' });
          await invalidateDomain(DOMAINS.Ledger, { sourceId: 'purchase-orders' });
        }
      } catch (err) {
        setError(formatApiError(err));
        throw err;
      }
    },
    [purchaseOrdersApi, fetchOrders, fetchDistributorLedger, setError, setSuccess]
  );

  const handlePrepareDistributorWhatsApp = useCallback(
    async (order) => {
      if (!order?.id) return;
      try {
        setError('');
        setSuccess('');
        setSendingWhatsAppOrderId(order.id);
        const response = await purchaseOrdersApi.prepareDistributorWhatsApp(order.id);
        const notice = response?.distributor_notice || null;
        const whatsappUrl = String(notice?.whatsapp?.whatsapp_url || '').trim();
        if (!whatsappUrl) {
          setError('WhatsApp message link is not available for this distributor.');
          return;
        }
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        setSuccess('Manual distributor WhatsApp message is ready.');
      } catch (err) {
        setSuccess('');
        setError(formatApiError(err));
      } finally {
        setSendingWhatsAppOrderId(null);
      }
    },
    [purchaseOrdersApi, setError, setSuccess, setSendingWhatsAppOrderId]
  );

  const handleDeleteOrder = useCallback(
    async (orderId) => {
      try {
        await purchaseOrdersApi.delete(orderId);
        fetchOrders();
        await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
      } catch (err) {
        setError(formatApiError(err));
      }
    },
    [purchaseOrdersApi, fetchOrders, setError]
  );

  return {
    handleUpdateStatus,
    handlePrepareDistributorWhatsApp,
    handleSendDistributorWhatsApp: handlePrepareDistributorWhatsApp,
    handleDeleteOrder,
  };
};

export default usePurchaseStatusHandlers;
