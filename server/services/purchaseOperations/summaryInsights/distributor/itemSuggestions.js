const buildLikelyItems = (productCounts, { limit = 3 } = {}) => (
  [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
);

const buildSuggestedItems = (suggestionMap, { limit = 5 } = {}) => (
  [...suggestionMap.values()]
    .sort((a, b) => {
      const countDiff = Number(b.quantity_count || 0) - Number(a.quantity_count || 0);
      if (countDiff !== 0) return countDiff;
      return String(b.latest_created_at || '').localeCompare(String(a.latest_created_at || ''));
    })
    .slice(0, limit)
    .map((entry) => ({
      product_id: entry.product_id,
      product_name: entry.product_name,
      quantity: Number(entry.quantity_count || 0) > 0
        ? Math.max(1, Number((Number(entry.quantity_total || 0) / Number(entry.quantity_count || 1)).toFixed(2)))
        : 1,
      uom: entry.uom || 'pcs',
      rate: Number(entry.rate || 0),
      unit_price: Number(entry.rate || 0),
      gst_rate: Number(entry.gst_rate || 0),
      discount_type: entry.discount_type || 'percent',
      discount_value: Number(entry.discount_value || 0),
    }))
);

const mergeSuggestedProductKnowledge = ({
  distributor,
  mergeDistributorProductKnowledge,
  likelyItems,
  suggestedItems,
} = {}) => mergeDistributorProductKnowledge({
  manualProductsSupplied: distributor.products_supplied || '',
  likelyItems,
  suggestedItems,
});

module.exports = {
  buildLikelyItems,
  buildSuggestedItems,
  mergeSuggestedProductKnowledge,
};
