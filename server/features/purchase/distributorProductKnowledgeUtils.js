const createDistributorProductKnowledgeUtils = () => {
  const parseDistributorProductsSupplied = (value = '') => {
    const seen = new Set();
    return String(value || '')
      .split(/[\n,;|]+/)
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .filter((part) => {
        const key = part.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const buildDistributorProductsSuppliedText = (items = []) => {
    const names = parseDistributorProductsSupplied(items.join(', '));
    return names.join(', ');
  };

  const mergeDistributorProductKnowledge = ({
    manualProductsSupplied = '',
    likelyItems = [],
    suggestedItems = [],
  } = {}) => {
    const manualItems = parseDistributorProductsSupplied(manualProductsSupplied);
    const historicalItems = parseDistributorProductsSupplied(
      [
        ...likelyItems,
        ...(Array.isArray(suggestedItems) ? suggestedItems.map((item) => item?.product_name) : []),
      ]
        .filter(Boolean)
        .join(', ')
    );
    const mergedItems = parseDistributorProductsSupplied(
      [...manualItems, ...historicalItems].join(', ')
    );
    return {
      manual_items: manualItems,
      historical_items: historicalItems,
      merged_items: mergedItems,
      merged_text: buildDistributorProductsSuppliedText(mergedItems),
    };
  };

  return {
    parseDistributorProductsSupplied,
    buildDistributorProductsSuppliedText,
    mergeDistributorProductKnowledge,
  };
};

module.exports = { createDistributorProductKnowledgeUtils };
