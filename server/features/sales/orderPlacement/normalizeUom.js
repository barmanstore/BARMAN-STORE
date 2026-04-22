const normalizeUomToken = (value, fallback = 'pcs') =>
  String(value || fallback)
    .trim()
    .toLowerCase() || fallback;

module.exports = { normalizeUomToken };
