import { getProductFallbackImage, getProductImageSrc } from '../../utils/productImage';

function SafeProductImage({
  product = null,
  src = '',
  fallbackProduct = null,
  alt = '',
  onError = null,
  ...rest
}) {
  const imageSource = product ?? src;
  const resolvedFallback = fallbackProduct ||
    (product && typeof product === 'object' ? product : null) ||
    (src && typeof src === 'object' ? src : null) || { name: alt || '', category: '' };

  return (
    <img
      src={getProductImageSrc(imageSource)}
      alt={alt}
      {...rest}
      onError={(event) => {
        if (typeof onError === 'function') {
          onError(event);
        }
        if (event.defaultPrevented) return;
        event.currentTarget.onerror = null;
        event.currentTarget.srcset = '';
        event.currentTarget.sizes = '';
        event.currentTarget.src = getProductFallbackImage(resolvedFallback);
      }}
    />
  );
}

export default SafeProductImage;
