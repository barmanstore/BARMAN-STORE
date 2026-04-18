import { apiFetch } from './core';

// ============================================
// DISTRIBUTOR LEDGER API (Credit/Payment)
// ============================================

const isNotFoundError = (err) =>
  Number(err?.status || 0) === 404 ||
  String(err?.message || '')
    .toLowerCase()
    .includes('not found');
const DISTRIBUTOR_LEDGER_DISABLED_KEY = 'distributor_ledger_api_disabled';
const readDistributorLedgerDisabled = () => {
  try {
    return sessionStorage.getItem(DISTRIBUTOR_LEDGER_DISABLED_KEY) === '1';
  } catch (e) {
    return false;
  }
};
const writeDistributorLedgerDisabled = (value) => {
  try {
    if (value) {
      sessionStorage.setItem(DISTRIBUTOR_LEDGER_DISABLED_KEY, '1');
    } else {
      sessionStorage.removeItem(DISTRIBUTOR_LEDGER_DISABLED_KEY);
    }
  } catch (e) {
    // ignore storage issues
  }
};

const distributorLedgerState = {
  disabled: readDistributorLedgerDisabled(),
  getAllEndpoint: null,
  byDistributorEndpoint: null,
  addEndpoint: null,
};

export const distributorLedgerApi = {
  getAll: async (params = {}) => {
    if (distributorLedgerState.disabled) return [];
    const query = new URLSearchParams(params).toString();
    const requests = [
      { endpoint: `/api/distributor-ledger${query ? `?${query}` : ''}` },
      { endpoint: `/api/distributors/ledger${query ? `?${query}` : ''}` },
    ];

    if (distributorLedgerState.getAllEndpoint) {
      const endpoint = `${distributorLedgerState.getAllEndpoint}${query ? `?${query}` : ''}`;
      return apiFetch(endpoint);
    }

    for (const request of requests) {
      try {
        const result = await apiFetch(request.endpoint);
        writeDistributorLedgerDisabled(false);
        distributorLedgerState.getAllEndpoint = request.endpoint.split('?')[0];
        return result;
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
      }
    }

    distributorLedgerState.disabled = true;
    writeDistributorLedgerDisabled(true);
    return [];
  },
  getByDistributor: async (distributorId, params = {}) => {
    if (distributorLedgerState.disabled) return [];
    const query = new URLSearchParams(params).toString();
    const requests = [
      { endpoint: `/api/distributors/${distributorId}/ledger${query ? `?${query}` : ''}` },
      { endpoint: `/api/distributors/${distributorId}/credit-history${query ? `?${query}` : ''}` },
    ];

    if (distributorLedgerState.byDistributorEndpoint) {
      const endpoint = `${distributorLedgerState.byDistributorEndpoint(distributorId)}${query ? `?${query}` : ''}`;
      return apiFetch(endpoint);
    }

    for (const request of requests) {
      try {
        const result = await apiFetch(request.endpoint);
        writeDistributorLedgerDisabled(false);
        if (request.endpoint.includes('/ledger')) {
          distributorLedgerState.byDistributorEndpoint = (id) => `/api/distributors/${id}/ledger`;
        } else {
          distributorLedgerState.byDistributorEndpoint = (id) =>
            `/api/distributors/${id}/credit-history`;
        }
        return result;
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
      }
    }

    distributorLedgerState.disabled = true;
    writeDistributorLedgerDisabled(true);
    return [];
  },
  addTransaction: async (distributorId, data) => {
    if (distributorLedgerState.disabled) {
      throw new Error('Distributor ledger API is not available on backend');
    }

    const normalizedAmount = Number(data?.amount || 0);
    const typeRaw = String(data?.type || data?.transaction_type || '').toLowerCase();
    const normalizedType = typeRaw === 'credit' ? 'given' : typeRaw || 'given';

    const payloadA = {
      ...data,
      amount: normalizedAmount,
      type: normalizedType,
      transaction_type: normalizedType,
    };
    const payloadB = {
      ...payloadA,
      transactionDate: data?.transactionDate || data?.transaction_date,
    };
    const payloadC = {
      ...payloadA,
      transaction_date: data?.transaction_date || data?.transactionDate,
    };
    const payloadD = {
      distributor_id: distributorId,
      user_id: distributorId,
      ...payloadC,
    };

    const requests = [
      {
        endpoint: `/api/distributors/${distributorId}/ledger`,
        options: { method: 'POST', body: payloadA },
      },
      {
        endpoint: `/api/distributors/${distributorId}/transactions`,
        options: { method: 'POST', body: payloadA },
      },
      {
        endpoint: `/api/distributors/${distributorId}/credit`,
        options: { method: 'POST', body: payloadB },
      },
      {
        endpoint: '/api/distributor-ledger',
        options: { method: 'POST', body: payloadD },
      },
      {
        endpoint: '/api/distributors/ledger',
        options: { method: 'POST', body: payloadD },
      },
    ];

    if (distributorLedgerState.addEndpoint) {
      const cachedEndpoint = distributorLedgerState.addEndpoint(distributorId);
      return apiFetch(cachedEndpoint, {
        method: 'POST',
        body:
          cachedEndpoint.includes('/distributor-ledger') ||
          cachedEndpoint.includes('/distributors/ledger')
            ? payloadD
            : payloadA,
      });
    }

    let lastError;
    for (const request of requests) {
      try {
        const result = await apiFetch(request.endpoint, request.options);
        writeDistributorLedgerDisabled(false);
        if (request.endpoint.includes('/api/distributor-ledger')) {
          distributorLedgerState.addEndpoint = () => '/api/distributor-ledger';
        } else if (request.endpoint.includes('/api/distributors/ledger')) {
          distributorLedgerState.addEndpoint = () => '/api/distributors/ledger';
        } else if (request.endpoint.includes('/transactions')) {
          distributorLedgerState.addEndpoint = (id) => `/api/distributors/${id}/transactions`;
        } else if (request.endpoint.includes('/credit')) {
          distributorLedgerState.addEndpoint = (id) => `/api/distributors/${id}/credit`;
        } else {
          distributorLedgerState.addEndpoint = (id) => `/api/distributors/${id}/ledger`;
        }
        return result;
      } catch (err) {
        lastError = err;
        if (!isNotFoundError(err)) throw err;
      }
    }

    distributorLedgerState.disabled = true;
    writeDistributorLedgerDisabled(true);
    throw lastError || new Error('Distributor ledger API is not available on backend');
  },
};
