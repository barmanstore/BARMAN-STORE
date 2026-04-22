const { createProductFieldNormalizers } = require('./normalizeFields');
const { createProductNormalizer } = require('./normalizeProduct');

const createProductNormalization = ({ generateSku } = {}) => {
  const fieldNormalizers = createProductFieldNormalizers();
  const productNormalizer = createProductNormalizer({ generateSku, fieldNormalizers });

  return {
    ...fieldNormalizers,
    ...productNormalizer,
  };
};

module.exports = { createProductNormalization };
