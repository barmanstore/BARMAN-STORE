import { useEffect } from 'react';
import { analyticsApi } from '../api/index.js';

const useProductsVitals = ({ productsTelemetryRef }) => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return undefined;
    const metrics = { lcp: 0, cls: 0, inp: 0 };
    let lcpObserver;
    let clsObserver;
    let inpObserver;
    let flushed = false;

    const flushVitals = () => {
      if (flushed) return;
      flushed = true;
      const sessionId = String(productsTelemetryRef.current.sessionId || '').trim();
      if (!sessionId) return;
      analyticsApi.heartbeat({
        session_id: sessionId,
        path: '/products',
        web_vitals: {
          session_id: sessionId,
          ab_variant: productsTelemetryRef.current.abVariant,
          lcp_ms: Math.round(Number(metrics.lcp || 0)),
          inp_ms: Math.round(Number(metrics.inp || 0)),
          cls: Number((metrics.cls || 0).toFixed(4)),
          captured_at: new Date().toISOString(),
        }
      }).catch(() => {});
    };

    try {
      lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry?.startTime) metrics.lcp = Math.max(metrics.lcp, lastEntry.startTime);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {
      // Ignore unsupported LCP metrics
    }

    try {
      clsObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput && Number.isFinite(entry.value)) {
            metrics.cls += entry.value;
          }
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (_) {
      // Ignore unsupported CLS metrics
    }

    try {
      inpObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          const duration = Number(entry.duration || 0);
          if (duration > metrics.inp) metrics.inp = duration;
        });
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch (_) {
      // Ignore unsupported input delay metrics
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushVitals();
    };

    window.addEventListener('pagehide', flushVitals);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      lcpObserver?.disconnect();
      clsObserver?.disconnect();
      inpObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushVitals);
      flushVitals();
    };
  }, [productsTelemetryRef]);
};

export default useProductsVitals;

