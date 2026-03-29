// Browser-facing ESM copy of the shared text-preview helpers.
// Keep this aligned with shared/textPreview.cjs because Vite source
// modules cannot execute raw CommonJS module.exports files in the browser.

const GRAPHEME_LOCALE = 'as';

const toFinitePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const createGraphemeSegmenter = () => (
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(GRAPHEME_LOCALE, { granularity: 'grapheme' })
    : null
);

const truncateGraphemeText = (value, maxLength = 0) => {
  const input = String(value ?? '');
  const limit = toFinitePositiveInteger(maxLength);
  if (!input || limit <= 0) return '';

  const segmenter = createGraphemeSegmenter();
  if (segmenter) {
    let count = 0;
    let result = '';
    for (const { segment } of segmenter.segment(input)) {
      if (count >= limit) break;
      result += segment;
      count += 1;
    }
    return result;
  }

  return Array.from(input).slice(0, limit).join('');
};

const buildMessagePreview = (value, maxLength = 280) => (
  truncateGraphemeText(String(value ?? '').trim(), maxLength)
);

export {
  buildMessagePreview,
  truncateGraphemeText,
};
