const DOMAINS = Object.freeze({
  Products: 'products',
  PurchaseOrders: 'purchase-orders',
  Ledger: 'ledger',
  Stock: 'stock',
});

const listenersByDomain = new Map();

const normalizeDomain = (domain) => String(domain || '').trim().toLowerCase();
const normalizeListenerId = (value) => String(value || '').trim().toLowerCase();

const getListenersForDomain = (domain, createIfMissing = false) => {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return null;
  if (!listenersByDomain.has(normalizedDomain) && createIfMissing) {
    listenersByDomain.set(normalizedDomain, new Set());
  }
  return listenersByDomain.get(normalizedDomain) || null;
};

const registerDomainListener = (domain, listener, { listenerId = '' } = {}) => {
  if (typeof listener !== 'function') return () => {};
  const listeners = getListenersForDomain(domain, true);
  const entry = {
    listener,
    listenerId: normalizeListenerId(listenerId),
  };
  listeners.add(entry);
  return () => {
    const currentListeners = getListenersForDomain(domain, false);
    if (!currentListeners) return;
    currentListeners.delete(entry);
    if (currentListeners.size === 0) {
      listenersByDomain.delete(normalizeDomain(domain));
    }
  };
};

const invalidateDomain = async (domain, payload = {}) => {
  const sourceId = normalizeListenerId(payload?.sourceId || payload?.listenerId || payload?.source || '');
  const listeners = Array.from(getListenersForDomain(domain, false) || []);
  if (!listeners.length) {
    if (process.env.NODE_ENV !== 'production' && typeof console.warn === 'function') {
      console.warn(`[invalidation] No listeners registered for domain "${normalizeDomain(domain)}".`);
    }
    return [];
  }

  const targetListeners = sourceId
    ? listeners.filter((entry) => normalizeListenerId(entry?.listenerId) !== sourceId)
    : listeners;

  const results = await Promise.allSettled(targetListeners.map((entry) => {
    try {
      return entry.listener(payload);
    } catch (error) {
      return Promise.reject(error);
    }
  }));

  return results;
};

const invalidateDomains = async (domains = [], payload = {}) => {
  const normalizedDomains = Array.isArray(domains)
    ? domains.map((domain) => normalizeDomain(domain)).filter(Boolean)
    : [];
  if (!normalizedDomains.length) return [];

  const results = [];
  for (const domain of normalizedDomains) {
    // Keep domain invalidations isolated so one failing listener does not block
    // the rest of the fan-out.
    // eslint-disable-next-line no-await-in-loop
    const domainResults = await invalidateDomain(domain, payload);
    results.push({ domain, results: domainResults });
  }
  return results;
};

export {
  DOMAINS,
  registerDomainListener,
  invalidateDomain,
  invalidateDomains,
};

export default {
  DOMAINS,
  registerDomainListener,
  invalidateDomain,
  invalidateDomains,
};
