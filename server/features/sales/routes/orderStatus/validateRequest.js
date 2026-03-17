const createInputError = (status, message) => Object.assign(new Error(message), { status });

const validateOrderStatusRequest = ({ body, normalizeOrderStatus, parseBooleanEnv, ORDER_STATUS_RECEIVED }) => {
  const requestedStatus = normalizeOrderStatus(body?.status, '');
  const reapplyPending = parseBooleanEnv(body?.reapply_pending, false);
  if (!requestedStatus) throw createInputError(400, 'Status is required');
  if (requestedStatus !== ORDER_STATUS_RECEIVED) {
    throw createInputError(400, 'Only received confirmation is allowed');
  }
  return { requestedStatus, reapplyPending };
};

module.exports = { validateOrderStatusRequest };
