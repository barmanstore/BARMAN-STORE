const getErrorStatus = (error, fallbackStatus = 500) => {
  const status = Number(error?.status || 0);
  return status > 0 ? status : fallbackStatus;
};

const buildErrorPayload = (error, fallbackMessage = 'Request failed') => {
  const message = error?.message || fallbackMessage || 'Request failed';
  const payload = { error: message };
  if (error?.details) payload.details = error.details;
  if (error?.issues) payload.issues = error.issues;
  return payload;
};

const sendRouteError = (res, error, { fallbackStatus = 500, fallbackMessage = 'Request failed' } = {}) => {
  const status = getErrorStatus(error, fallbackStatus);
  return res.status(status).json(buildErrorPayload(error, fallbackMessage));
};

module.exports = {
  getErrorStatus,
  buildErrorPayload,
  sendRouteError,
};
