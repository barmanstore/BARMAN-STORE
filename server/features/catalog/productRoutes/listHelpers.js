const createProductListHelpers = ({ zlib, env = process.env } = {}) => {
  const clampInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  const normalizeSearchText = (value, maxLength = 160) => (
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );

  const PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC = clampInt(
    env.PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC,
    20,
    0,
    3600
  );
  const PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC = clampInt(
    env.PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC,
    120,
    0,
    86400
  );
  const PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC = clampInt(
    env.PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC,
    180,
    0,
    86400
  );
  const PRODUCTS_LIST_COMPRESS_MIN_BYTES = clampInt(
    env.PRODUCTS_LIST_COMPRESS_MIN_BYTES,
    1024,
    256,
    64 * 1024
  );

  const appendVaryHeader = (res, headerName) => {
    const key = String(headerName || '').trim();
    if (!key) return;
    const existing = String(res.getHeader('Vary') || '').trim();
    if (!existing) {
      res.setHeader('Vary', key);
      return;
    }
    const parts = existing.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (parts.includes(key.toLowerCase())) return;
    res.setHeader('Vary', `${existing}, ${key}`);
  };

  const setProductsListCacheHeaders = (res, options = {}) => {
    const {
      isPaginated = false,
      includeInactive = false,
      status = '',
      hasActiveOffers = false,
    } = options;
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (hasActiveOffers) {
      res.setHeader('Cache-Control', 'private, no-store');
      return;
    }
    const cacheablePublicListing = isPaginated && !includeInactive && normalizedStatus !== 'inactive';
    if (cacheablePublicListing) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC}, s-maxage=${PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC}, stale-while-revalidate=${PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC}`
      );
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
  };

  const sendJsonWithOptionalCompression = (req, res, payload) => {
    const json = JSON.stringify(payload);
    const rawBuffer = Buffer.from(json, 'utf8');
    const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
    const supportsBrotli = acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding.includes('gzip');
    appendVaryHeader(res, 'Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (rawBuffer.length < PRODUCTS_LIST_COMPRESS_MIN_BYTES || (!supportsBrotli && !supportsGzip)) {
      return res.send(rawBuffer);
    }
    try {
      let compressedBuffer = null;
      let encoding = '';
      if (supportsBrotli) {
        compressedBuffer = zlib.brotliCompressSync(rawBuffer, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
          },
        });
        encoding = 'br';
      } else if (supportsGzip) {
        compressedBuffer = zlib.gzipSync(rawBuffer, { level: 6 });
        encoding = 'gzip';
      }
      if (!compressedBuffer || compressedBuffer.length >= rawBuffer.length) {
        return res.send(rawBuffer);
      }
      res.setHeader('Content-Encoding', encoding);
      return res.send(compressedBuffer);
    } catch (_) {
      return res.send(rawBuffer);
    }
  };

  const toSearchImage = (row, index = 0) => {
    const thumbUrl = String(
      row?.thumbnail
      || row?.thumbnail_url
      || row?.image
      || row?.original
      || row?.link
      || ''
    ).trim();
    const fullUrl = String(
      row?.original
      || row?.image
      || row?.link
      || row?.thumbnail
      || ''
    ).trim();
    if (!fullUrl) return null;
    const position = Number(row?.position || 0) || (index + 1);
    return {
      id: `serpapi-bing-${position}`,
      thumbUrl: thumbUrl || fullUrl,
      fullUrl,
      source: 'serpapi-bing',
      title: String(row?.title || row?.source || row?.source_name || `Suggestion ${index + 1}`).trim(),
    };
  };

  return {
    clampInt,
    normalizeSearchText,
    PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC,
    PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC,
    PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC,
    PRODUCTS_LIST_COMPRESS_MIN_BYTES,
    appendVaryHeader,
    setProductsListCacheHeaders,
    sendJsonWithOptionalCompression,
    toSearchImage,
  };
};

module.exports = { createProductListHelpers };
