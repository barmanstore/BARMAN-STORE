import { useEffect, useMemo, useState } from 'react';
import { resolveMediaUrl, resolveMediaSourceForDisplay } from '../api/index.js';
import { getProductFallbackImage } from '../../../../shared/utils/productImage';
import { buildResponsiveImageSources, cacheResolvedMediaSource, getCachedResolvedMediaSource } from '../utils/productHelpers.js';

function SafeProductImage({ src, alt, className, fallbackProduct, width, height, fetchPriority, ...rest }) {
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    const cached = getCachedResolvedMediaSource(src);
    return cached || resolveMediaUrl(src) || src || getProductFallbackImage(fallbackProduct);
  });
  const isDetailImage = String(className || '').includes('detail-mobile-image');
  const preferredWidth = isDetailImage ? 960 : 520;
  const explicitWidth = Math.max(16, Math.round(Number(width || (isDetailImage ? 960 : 400))));
  const explicitHeight = Math.max(16, Math.round(Number(height || (isDetailImage ? 600 : 400))));
  const decodeMode = String(rest.loading || '').toLowerCase() === 'eager' ? 'sync' : 'async';
  const responsiveSources = useMemo(
    () => buildResponsiveImageSources(resolvedSrc, preferredWidth),
    [resolvedSrc, preferredWidth]
  );

  useEffect(() => {
    let mounted = true;
    let objectUrlToRevoke = '';

    const load = async () => {
      if (!src) {
        if (mounted) setResolvedSrc(getProductFallbackImage(fallbackProduct));
        return;
      }
      const cachedSrc = getCachedResolvedMediaSource(src);
      if (cachedSrc) {
        if (mounted) setResolvedSrc(cachedSrc);
        return;
      }
      if (mounted) setResolvedSrc(resolveMediaUrl(src) || src);
      try {
        const resolved = await resolveMediaSourceForDisplay(src);
        if (!mounted) {
          if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
          return;
        }
        if (resolved.revoke && resolved.src) objectUrlToRevoke = resolved.src;
        const nextSrc = resolved.src || getProductFallbackImage(fallbackProduct);
        if (resolved.src) cacheResolvedMediaSource(src, resolved.src);
        setResolvedSrc(nextSrc);
      } catch (_) {
        if (mounted) setResolvedSrc(getProductFallbackImage(fallbackProduct));
      }
    };

    load();
    return () => {
      mounted = false;
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    };
  }, [src, fallbackProduct]);

  return (
    <img
      src={responsiveSources.src || resolvedSrc}
      srcSet={responsiveSources.srcSet || undefined}
      sizes={responsiveSources.sizes || undefined}
      alt={alt}
      className={className}
      width={explicitWidth}
      height={explicitHeight}
      fetchPriority={fetchPriority}
      {...rest}
      decoding={decodeMode}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.srcset = '';
        event.currentTarget.sizes = '';
        event.currentTarget.src = getProductFallbackImage(fallbackProduct);
      }}
    />
  );
}

export default SafeProductImage;


