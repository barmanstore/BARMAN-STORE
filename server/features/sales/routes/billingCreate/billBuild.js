const { buildBillContext } = require('./build/buildBillContext');
const { buildBillItems } = require('./build/buildBillItems');
const { buildBillTotals } = require('./build/buildBillTotals');

const buildBillDraft = async (deps, req) => {
  const createHttpError = (status, message, details) => {
    const error = new Error(message);
    error.status = status;
    if (details) error.details = details;
    return error;
  };

  const contextResult = await buildBillContext(deps, req, createHttpError);
  if (contextResult.dedupe) return contextResult.dedupe;
  const { context } = contextResult;

  const itemResult = await buildBillItems(deps, context, createHttpError);
  const draft = buildBillTotals(deps, context, itemResult, createHttpError);

  return {
    clientRequestId: context.clientRequestId,
    linkedOrderId: context.linkedOrderId,
    draft,
  };
};

module.exports = { buildBillDraft };
