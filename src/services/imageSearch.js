import { apiFetch } from './api';

const normalize = (value) => String(value || '').trim();

const buildAutoQuery = ({ name, brand, content, category, query }) => {
  const explicit = normalize(query);
  if (explicit) return explicit;
  return [
    normalize(brand),
    normalize(name),
    normalize(content),
    normalize(category),
    'product packshot',
  ].filter(Boolean).join(' ');
};

const makeFallbackImages = (seedText, limit) => {
  const baseSeed = encodeURIComponent(seedText || 'product-image');
  const out = [];
  for (let i = 0; i < limit; i += 1) {
    const seed = `${baseSeed}-${i + 1}`;
    out.push({
      id: `fallback-${seed}`,
      thumbUrl: `https://picsum.photos/seed/${seed}/320/220`,
      fullUrl: `https://picsum.photos/seed/${seed}/800/520`,
      source: 'fallback',
      title: `Suggestion ${i + 1}`,
    });
  }
  return out;
};

const fetchSerpApiBingImages = async (query, limit) => {
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.max(1, Math.min(8, Number(limit) || 4))),
  });
  const data = await apiFetch(`/api/products/image-search?${params.toString()}`);
  const rows = Array.isArray(data?.images) ? data.images : [];
  return rows.slice(0, limit).map((img, index) => ({
    id: String(img?.id || `serpapi-bing-${index + 1}`),
    thumbUrl: String(img?.thumbUrl || img?.fullUrl || ''),
    fullUrl: String(img?.fullUrl || ''),
    source: 'serpapi-bing',
    title: String(img?.title || `Suggestion ${index + 1}`),
  })).filter((img) => img.fullUrl);
};

export const searchProductImages = async (params = {}) => {
  const limit = Math.max(1, Math.min(12, Number(params.limit || 4)));
  const query = buildAutoQuery(params);

  if (!query) {
    return { query: '', provider: 'fallback', images: makeFallbackImages('product-image', limit) };
  }

  let serpImages = [];
  try {
    serpImages = await fetchSerpApiBingImages(query, limit);
  } catch (error) {
    const message = String(error?.message || '').trim();
    throw new Error(message || 'SerpApi Bing image search failed');
  }

  if (serpImages.length) {
    return { query, provider: 'serpapi-bing', images: serpImages };
  }

  return { query, provider: 'fallback', images: makeFallbackImages(query, limit) };
};
