export const resolveOverlayEntryZIndex = (entry) => {
  if (!entry) return 0;
  if (typeof entry.getZIndex === 'function') {
    const value = Number(entry.getZIndex());
    return Number.isFinite(value) ? value : 0;
  }
  const value = Number(entry.zIndex || 0);
  return Number.isFinite(value) ? value : 0;
};

export const compareOverlayEntries = (left, right) => {
  const zIndexDelta = resolveOverlayEntryZIndex(right) - resolveOverlayEntryZIndex(left);
  if (zIndexDelta !== 0) return zIndexDelta;
  return Number(right?.sequence || 0) - Number(left?.sequence || 0);
};

export const selectTopEscapeEntry = (entries = []) => {
  const escapeEntries = entries.filter((entry) => typeof entry?.onEscape === 'function');
  if (!escapeEntries.length) return null;
  return [...escapeEntries].sort(compareOverlayEntries)[0] || null;
};

export const shouldLockOverlayBackground = (entries = []) =>
  entries.some((entry) => entry?.type === 'overlay');
