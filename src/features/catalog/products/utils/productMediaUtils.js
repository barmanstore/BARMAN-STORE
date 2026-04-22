import { resolveMediaUrl } from '../api/index.js';
import { getProductFallbackImage } from '../../../../shared/utils/productImage';
import { RESOLVED_MEDIA_CACHE_MAX_ITEMS } from './productConstants';

const resolvedMediaSourceCache = new Map();

const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

const getCachedResolvedMediaSource = (value) => {
  const key = String(value || '').trim();
  if (!key) return '';
  return String(resolvedMediaSourceCache.get(key) || '').trim();
};

const cacheResolvedMediaSource = (source, resolvedSource) => {
  const sourceKey = String(source || '').trim();
  const resolvedKey = String(resolvedSource || '').trim();
  if (!sourceKey || !resolvedKey) return;
  if (resolvedMediaSourceCache.has(sourceKey)) {
    resolvedMediaSourceCache.delete(sourceKey);
  }
  resolvedMediaSourceCache.set(sourceKey, resolvedKey);
  if (resolvedMediaSourceCache.size <= RESOLVED_MEDIA_CACHE_MAX_ITEMS) return;
  const oldestKey = resolvedMediaSourceCache.keys().next().value;
  if (oldestKey) resolvedMediaSourceCache.delete(oldestKey);
};

const getSuggestionImageSrc = (item) => {
  const fromRow = resolveMediaUrl(item?.image);
  if (fromRow) return fromRow;
  return getProductFallbackImage(item);
};

const buildResponsiveImageSources = (src, preferredWidth = 480) => {
  const raw = String(src || '').trim();
  if (!raw || /^blob:/i.test(raw) || /^data:/i.test(raw)) {
    return { src: raw, srcSet: '', sizes: '' };
  }

  let baseUrl;
  try {
    baseUrl = new URL(
      raw,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    );
  } catch (_) {
    return { src: raw, srcSet: '', sizes: '' };
  }

  const host = String(baseUrl.hostname || '').toLowerCase();
  const isUnsplash = host.includes('unsplash.com');
  const isCloudinary = host.includes('cloudinary.com') && baseUrl.pathname.includes('/upload/');
  if (!isUnsplash && !isCloudinary) {
    return { src: baseUrl.toString(), srcSet: '', sizes: '' };
  }

  const widths = Array.from(
    new Set([
      Math.max(320, Math.round(preferredWidth * 0.75)),
      Math.max(420, Math.round(preferredWidth)),
      Math.max(640, Math.round(preferredWidth * 1.6)),
    ])
  ).sort((a, b) => a - b);

  const toOptimizedUrl = (width) => {
    const next = new URL(baseUrl.toString());

    if (isUnsplash) {
      next.searchParams.set('auto', 'format');
      next.searchParams.set('fit', 'max');
      next.searchParams.set('q', '85');
      next.searchParams.set('w', String(width));
      return next.toString();
    }

    if (isCloudinary) {
      const [left, right] = next.pathname.split('/upload/');
      next.pathname = `${left}/upload/f_auto,q_auto:good,w_${width}/${right}`;
      return next.toString();
    }
    return next.toString();
  };

  const srcSet = widths.map((width) => `${toOptimizedUrl(width)} ${width}w`).join(', ');
  const srcUrl = toOptimizedUrl(widths[0]);
  const sizes =
    preferredWidth >= 900 ? '(max-width: 767px) 92vw, 840px' : '(max-width: 767px) 46vw, 280px';

  return { src: srcUrl, srcSet, sizes };
};

export {
  getPublicFileUrl,
  getCachedResolvedMediaSource,
  cacheResolvedMediaSource,
  getSuggestionImageSrc,
  buildResponsiveImageSources,
};
