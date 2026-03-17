const parseQuantityText = (rawValue) => {
  const cleaned = String(rawValue || '').trim();
  if (!cleaned) return { quantity: 1, quantityLabel: '1' };
  const numberMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  const parsedQuantity = Number(numberMatch?.[1] || 0);
  return {
    quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
    quantityLabel: cleaned,
  };
};

const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

const getManualSearchScore = (product, query) => {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const name = normalizeSearchText(product?.name);
  const category = normalizeSearchText(product?.category);
  const brand = normalizeSearchText(product?.brand);
  const content = normalizeSearchText(product?.content);
  const color = normalizeSearchText(product?.color);
  const sku = normalizeSearchText(product?.sku);
  const barcode = normalizeSearchText(product?.barcode);
  const haystack = [name, category, brand, content, color, sku, barcode].join(' ');

  let score = 0;
  if (name === q) score += 300;
  else if (name.startsWith(q)) score += 220;
  else if (name.includes(q)) score += 150;

  if (category.startsWith(q)) score += 80;
  if (brand.startsWith(q)) score += 70;
  if (sku === q || barcode === q) score += 240;

  for (const token of tokens) {
    if (!token) continue;
    if (name.startsWith(token)) score += 35;
    else if (name.includes(token)) score += 22;
    if (category.includes(token)) score += 12;
    if (brand.includes(token)) score += 10;
    if (content.includes(token) || color.includes(token)) score += 8;
    if (sku.includes(token) || barcode.includes(token)) score += 15;
  }

  if (haystack.includes(q)) score += 20;
  if (Number(product?.stock || 0) > 0) score += 6;
  return score;
};

const rankManualMatches = (rows, query) => (
  (Array.isArray(rows) ? rows : [])
    .filter((product) => Number(product?.id || 0) > 0)
    .map((product) => ({ product, score: getManualSearchScore(product, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bStock = Number(b.product?.stock || 0);
      const aStock = Number(a.product?.stock || 0);
      if (bStock !== aStock) return bStock - aStock;
      return String(a.product?.name || '').localeCompare(String(b.product?.name || ''));
    })
    .slice(0, 8)
    .map((row) => row.product)
);

const QUICK_QTY_OPTIONS = ['1', '2', '5', '1kg', '500g'];

export {
  parseQuantityText,
  getManualSearchScore,
  rankManualMatches,
  QUICK_QTY_OPTIONS,
};
