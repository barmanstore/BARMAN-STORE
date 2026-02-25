import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { searchProductImages } from '../services/imageSearch';
import { getProductImageSrc } from '../utils/productImage';
import './ImageUrlPicker.css';

const normalizeHttpUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
  } catch (_) {
    return '';
  }
};

function ImageUrlPicker({ value, onChange, productMeta = {}, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queryUsed, setQueryUsed] = useState('');
  const [choices, setChoices] = useState([]);

  const currentValue = String(value || '').trim();

  const autoQueryPreview = useMemo(() => {
    return [
      String(productMeta?.brand || '').trim(),
      String(productMeta?.name || '').trim(),
      String(productMeta?.content || '').trim(),
      String(productMeta?.category || '').trim(),
      'product packshot',
    ].filter(Boolean).join(' ');
  }, [productMeta]);

  const handleInputChange = (event) => {
    const next = String(event.target.value || '');
    onChange(next);
    if (error) setError('');
  };

  const handleSearchClick = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await searchProductImages({
        ...productMeta,
        limit: 4,
      });
      setQueryUsed(result.query || '');
      setChoices(Array.isArray(result.images) ? result.images.slice(0, 4) : []);
    } catch (err) {
      setError(err?.message || 'Image search failed');
      setChoices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChoice = (image) => {
    const safeUrl = normalizeHttpUrl(image?.fullUrl || image?.thumbUrl || '');
    if (!safeUrl) {
      setError('Selected image URL is invalid');
      return;
    }
    onChange(safeUrl);
    setError('');
  };

  return (
    <div className="image-url-picker">
      <div className="image-url-picker-row">
        <input
          type="url"
          id="image"
          name="image"
          value={currentValue}
          onChange={handleInputChange}
          placeholder="https://example.com/image.jpg"
          className="input-field"
          disabled={disabled}
        />
        <button
          type="button"
          className="image-search-btn"
          onClick={handleSearchClick}
          disabled={disabled || loading}
        >
          <Search size={16} />
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <small className="field-help">
        {queryUsed ? `Search used: ${queryUsed}` : `Auto query preview: ${autoQueryPreview || 'product packshot'}`}
      </small>
      {error && <span className="field-error">{error}</span>}

      {choices.length > 0 && (
        <div className="image-choice-grid">
          {choices.map((image) => {
            const selected = normalizeHttpUrl(image.fullUrl) === normalizeHttpUrl(currentValue);
            return (
              <button
                key={image.id}
                type="button"
                className={`image-choice-card${selected ? ' selected' : ''}`}
                onClick={() => handleSelectChoice(image)}
                title={image.title || 'Image option'}
              >
                <img
                  src={getProductImageSrc(image.thumbUrl || image.fullUrl)}
                  alt={image.title || 'Image option'}
                  loading="lazy"
                />
                <span>{image.title || 'Image option'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ImageUrlPicker;
