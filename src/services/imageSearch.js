const normalize = (value) => String(value || '').trim();

const GOOGLE_CSE_API_KEY = normalize(import.meta.env.VITE_GOOGLE_CSE_API_KEY);
const GOOGLE_CSE_ID = normalize(import.meta.env.VITE_GOOGLE_CSE_ID);

const UNSPLASH_ACCESS_KEY = normalize(import.meta.env.VITE_UNSPLASH_ACCESS_KEY);
const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

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

const fetchGoogleCseImages = async (query, limit) => {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_ID) return [];

  const params = new URLSearchParams({
    key: GOOGLE_CSE_API_KEY,
    cx: GOOGLE_CSE_ID,
    q: query,
    searchType: 'image',
    num: String(Math.max(1, Math.min(10, Number(limit) || 4))),
    safe: 'active',
  });

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
  if (!response.ok) throw new Error('Google image search request failed');

  const data = await response.json();
  const rows = Array.isArray(data?.items) ? data.items : [];

  return rows.slice(0, limit).map((img, index) => ({
    id: `google-cse-${img.cacheId || index}`,
    thumbUrl: img?.image?.thumbnailLink || img?.link || '',
    fullUrl: img?.link || img?.image?.contextLink || '',
    source: 'google-cse',
    title: img?.title || img?.snippet || `Suggestion ${index + 1}`,
  })).filter((img) => img.fullUrl);
};

const fetchUnsplashImages = async (query, limit) => {
  if (!UNSPLASH_ACCESS_KEY) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(limit),
    orientation: 'landscape',
  });

  const response = await fetch(`${UNSPLASH_API_URL}?${params.toString()}`, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });

  if (!response.ok) throw new Error('Unsplash request failed');

  const data = await response.json();
  const rows = Array.isArray(data?.results) ? data.results : [];

  return rows.slice(0, limit).map((img, index) => ({
    id: `unsplash-${img.id || index}`,
    thumbUrl: img?.urls?.small || img?.urls?.thumb || img?.urls?.regular || '',
    fullUrl: img?.urls?.regular || img?.urls?.full || img?.urls?.small || '',
    source: 'unsplash',
    title: img?.alt_description || img?.description || `Suggestion ${index + 1}`,
  })).filter((img) => img.fullUrl);
};

export const searchProductImages = async (params = {}) => {
  const limit = Math.max(1, Math.min(12, Number(params.limit || 4)));
  const query = buildAutoQuery(params);

  if (!query) {
    return { query: '', images: makeFallbackImages('product-image', limit) };
  }

  try {
    const google = await fetchGoogleCseImages(query, limit);
    if (google.length) return { query, images: google };
  } catch (_) {
    // Fall through to next provider.
  }

  try {
    const unsplash = await fetchUnsplashImages(query, limit);
    if (unsplash.length) return { query, images: unsplash };
  } catch (_) {
    // Fall through to fallback image set.
  }

  return { query, images: makeFallbackImages(query, limit) };
};
