import { useCallback, useEffect } from 'react';
import { analyticsApi } from '../../../../services/api';
import {
  PRODUCTS_TELEMETRY_SESSION_KEY,
  PRODUCTS_AB_VARIANT_KEY,
  readSessionStorageValue,
  writeSessionStorageValue,
  createTelemetrySessionId,
} from '../utils/productHelpers.jsx';

function useProductsTelemetry({
  productsTelemetryRef,
  groupBy,
  sortBy,
  inStockOnly,
  isMobile,
  searchParams,
}) {
  const trackProductsEvent = useCallback((eventName, payload = {}, options = {}) => {
    if (typeof window === 'undefined') return;
    const name = String(eventName || '').trim();
    if (!name) return;
    const sessionId = String(productsTelemetryRef.current.sessionId || '').trim();
    if (!sessionId) return;
    const throttleMs = Math.max(0, Number(options.throttleMs || 0));
    const throttleKey = String(options.throttleKey || name);
    const now = Date.now();
    if (throttleMs > 0) {
      const previous = Number(productsTelemetryRef.current.lastEventAt[throttleKey] || 0);
      if (now - previous < throttleMs) return;
      productsTelemetryRef.current.lastEventAt[throttleKey] = now;
    }
    analyticsApi.heartbeat({
      session_id: sessionId,
      path: '/products',
      product_event: {
        name,
        at: new Date().toISOString(),
        session_id: sessionId,
        ab_variant: productsTelemetryRef.current.abVariant,
        ...payload
      }
    }).catch(() => {});
  }, [productsTelemetryRef]);

  useEffect(() => {
    const existingSessionId = readSessionStorageValue(PRODUCTS_TELEMETRY_SESSION_KEY);
    const nextSessionId = existingSessionId || createTelemetrySessionId();
    if (!existingSessionId) writeSessionStorageValue(PRODUCTS_TELEMETRY_SESSION_KEY, nextSessionId);
    const queryVariant = String(searchParams.get('ab') || '').trim().toLowerCase();
    let storedVariant = '';
    try {
      storedVariant = String(localStorage.getItem(PRODUCTS_AB_VARIANT_KEY) || '').trim().toLowerCase();
    } catch (_) {
      storedVariant = '';
    }
    const resolvedVariant = queryVariant || storedVariant || 'control';
    if (queryVariant && queryVariant !== storedVariant) {
      try {
        localStorage.setItem(PRODUCTS_AB_VARIANT_KEY, queryVariant);
      } catch (_) {
        // Ignore storage write issues.
      }
    }
    productsTelemetryRef.current.sessionId = nextSessionId;
    productsTelemetryRef.current.abVariant = resolvedVariant;
    trackProductsEvent('products_page_view', {
      group_by: groupBy,
      sort_by: sortBy,
      stock_only: inStockOnly ? 1 : 0,
      device: isMobile ? 'mobile' : 'desktop'
    }, { throttleMs: 2000, throttleKey: 'products_page_view' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, sortBy, inStockOnly, isMobile, searchParams]);

  return trackProductsEvent;
}

export default useProductsTelemetry;
