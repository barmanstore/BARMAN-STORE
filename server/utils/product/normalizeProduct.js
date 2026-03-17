const { createProductRecordNormalizer } = require('./normalizers/productRecordNormalizer');
const { createProductInputNormalizer } = require('./normalizers/productInputNormalizer');
const { createProductPayloadValidator } = require('./normalizers/productPayloadValidator');

const createProductNormalizer = ({ generateSku, fieldNormalizers }) => {
  const normalizeProductRecord = createProductRecordNormalizer({ fieldNormalizers });
  const normalizeProductInput = createProductInputNormalizer({ generateSku, fieldNormalizers });
  const validateProductPayload = createProductPayloadValidator({ fieldNormalizers });

  return {
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
  };
};

module.exports = { createProductNormalizer };
