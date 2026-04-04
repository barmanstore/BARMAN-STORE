import { useEffect, useMemo, useState } from 'react';
import { offersApi } from '../services/api';

const isMeaningfulItem = (item = {}) => {
  const productId = Number(item?.product_id || item?.productId || 0);
  const quantity = Number(item?.quantity ?? item?.qty ?? 0);
  const itemType = String(item?.item_type || item?.type || '').trim().toLowerCase();
  return (
    productId > 0
    || itemType === 'custom'
    || itemType === 'manual'
  ) && quantity > 0;
};

export default function useOfferPricingPreview({
  items = [],
  context = 'cart',
  offerContext = null,
  enabled = true,
  debounceMs = 180,
}) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const offerContextCustomerUserId = Number(
    offerContext?.customer_user_id
    || offerContext?.customerUserId
    || offerContext?.user_id
    || offerContext?.userId
    || 0
  ) || 0;
  const offerContextExcludeOrderId = Number(
    offerContext?.exclude_order_id
    || offerContext?.excludeOrderId
    || offerContext?.order_id
    || offerContext?.orderId
    || 0
  ) || 0;

  const normalizedItems = useMemo(
    () => (Array.isArray(items) ? items.filter(isMeaningfulItem) : []),
    [items]
  );
  const normalizedOfferContext = useMemo(() => {
    if (!(offerContextCustomerUserId > 0) && !(offerContextExcludeOrderId > 0)) return null;
    return {
      ...(offerContextCustomerUserId > 0 ? { customer_user_id: offerContextCustomerUserId } : {}),
      ...(offerContextExcludeOrderId > 0 ? { exclude_order_id: offerContextExcludeOrderId } : {}),
    };
  }, [offerContextCustomerUserId, offerContextExcludeOrderId]);
  const signature = useMemo(
    () => JSON.stringify({ context, items: normalizedItems, offerContext: normalizedOfferContext }),
    [context, normalizedItems, normalizedOfferContext]
  );

  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      setLoading(false);
      setError('');
      return undefined;
    }
    if (!normalizedItems.length) {
      setPreview(null);
      setLoading(false);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const nextPreview = await offersApi.previewPricing(
          {
            context,
            items: normalizedItems,
            offer_context: normalizedOfferContext,
          },
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setPreview(nextPreview);
      } catch (previewError) {
        if (controller.signal.aborted) return;
        setPreview(null);
        setError(previewError?.message || 'Unable to refresh offer pricing.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, Math.max(0, Number(debounceMs || 0)));

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [context, debounceMs, enabled, normalizedItems, normalizedOfferContext, signature]);

  return {
    preview,
    loading,
    error,
  };
}
