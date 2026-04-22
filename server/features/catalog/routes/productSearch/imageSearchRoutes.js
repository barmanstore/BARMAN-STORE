const registerProductSearchImageRoutes = (deps) => {
  const { app, requireAdmin, normalizeSearchText, clampInt, toSearchImage } = deps;

  app.get('/api/products/image-search', requireAdmin, async (req, res) => {
    try {
      const apiKey = String(process.env.SERPAPI_KEY || '').trim();
      if (!apiKey) {
        return res.status(503).json({ error: 'SERPAPI_KEY is not configured' });
      }

      const query = normalizeSearchText(req.query?.q || req.query?.query || '');
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      const limit = clampInt(req.query?.limit, 4, 1, 8);

      const params = new URLSearchParams({
        engine: 'bing_images',
        q: query,
        count: String(limit),
        safeSearch: 'Strict',
        api_key: apiKey,
      });

      const upstream = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        const upstreamError = String(payload?.error || payload?.message || '').trim();
        const status = upstream.status === 429 ? 429 : 502;
        return res.status(status).json({ error: upstreamError || 'Image provider request failed' });
      }

      const rows = Array.isArray(payload?.images_results) ? payload.images_results : [];
      const images = [];
      const seen = new Set();
      for (let i = 0; i < rows.length; i += 1) {
        const mapped = toSearchImage(rows[i], i);
        if (!mapped) continue;
        const dedupeKey = mapped.fullUrl.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        images.push(mapped);
        if (images.length >= limit) break;
      }

      return res.json({
        query,
        provider: 'serpapi-bing',
        images,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Image search failed' });
    }
  });
};

module.exports = { registerProductSearchImageRoutes };
