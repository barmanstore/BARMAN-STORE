const { createCategoryNormalization } = require('./categoryHelperParts/normalization');
const { createCategoryErrors } = require('./categoryHelperParts/errors');
const { createCategoryQueries } = require('./categoryHelperParts/queries');
const { createCategoryHierarchy } = require('./categoryHelperParts/hierarchy');
const { createCategoryTree } = require('./categoryHelperParts/tree');

const createCategoryRouteHelpers = ({ dbAllAsync, dbGetAsync, dbRunAsync } = {}) => {
  const normalization = createCategoryNormalization();
  const errors = createCategoryErrors();
  const queries = createCategoryQueries({
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    normalizeCategoryName: normalization.normalizeCategoryName,
    toNullablePositiveInt: normalization.toNullablePositiveInt,
    normalizeCategoryRow: normalization.normalizeCategoryRow,
  });
  const hierarchy = createCategoryHierarchy({
    normalizeCategoryName: normalization.normalizeCategoryName,
    splitHierarchySegments: normalization.splitHierarchySegments,
    ensureCategoryNodeAsync: queries.ensureCategoryNodeAsync,
  });
  const tree = createCategoryTree({
    toNullablePositiveInt: normalization.toNullablePositiveInt,
    normalizeCategoryRow: normalization.normalizeCategoryRow,
    getCategoryByIdAsync: queries.getCategoryByIdAsync,
  });

  return {
    ...normalization,
    ...errors,
    ...queries,
    ...hierarchy,
    ...tree,
  };
};

module.exports = { createCategoryRouteHelpers };
