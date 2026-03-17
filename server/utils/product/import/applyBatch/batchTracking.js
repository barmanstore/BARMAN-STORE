const createBatchTracking = ({ allowIdenticalRows }) => {
  const seenInBatch = {
    productIds: new Map(),
    sku: new Map(),
    barcode: new Map(),
    identity: new Map(),
  };
  const allowIdenticalSet = new Set(
    Array.isArray(allowIdenticalRows)
      ? allowIdenticalRows.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : []
  );

  return { seenInBatch, allowIdenticalSet };
};

module.exports = { createBatchTracking };
