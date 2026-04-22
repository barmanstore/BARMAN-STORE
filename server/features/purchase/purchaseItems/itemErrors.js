const createPurchaseValidationError = (message, details = []) => {
  const error = new Error(message);
  error.status = 400;
  if (details.length) error.details = details;
  return error;
};

const createPurchaseConflictError = (message, conflictType, conflict = null) => {
  const error = new Error(message);
  error.status = 409;
  error.conflictType = conflictType;
  error.conflict = conflict;
  return error;
};

module.exports = { createPurchaseValidationError, createPurchaseConflictError };
