import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

function VirtualizedFamilyGrid({
  families,
  renderFamilyCard,
  estimatedColumns = 2,
  estimatedCardHeight = 290,
  shouldVirtualize = false
}) {
  const hostRef = useRef(null);
  const itemRefs = useRef(new Map());
  const [isNearViewport, setIsNearViewport] = useState(!shouldVirtualize);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.max(0, Math.min((families?.length || 1) - 1, 15)) });
  const cols = Math.max(1, Number(estimatedColumns || 1));
  const rowHeight = Math.max(160, Number(estimatedCardHeight || 290));
  const totalItems = Math.max(0, Number(families?.length || 0));
  const totalRows = Math.max(1, Math.ceil(totalItems / cols));
  const [rowHeights, setRowHeights] = useState(() => Array.from({ length: totalRows }, () => rowHeight));
  const rowOffsets = useMemo(() => {
    const offsets = new Array(totalRows + 1);
    offsets[0] = 0;
    for (let index = 0; index < totalRows; index += 1) {
      offsets[index + 1] = offsets[index] + Math.max(120, Number(rowHeights[index] || rowHeight));
    }
    return offsets;
  }, [rowHeights, totalRows, rowHeight]);
  const totalHeight = Math.max(110, rowOffsets[totalRows] || (totalRows * rowHeight));
  const startRowIndex = Math.floor(Math.max(0, visibleRange.start) / cols);
  const virtualWindowOffset = rowOffsets[startRowIndex] || 0;

  const findRowIndexAtOffset = (offsetPx) => {
    if (totalRows <= 1) return 0;
    let low = 0;
    let high = totalRows - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((rowOffsets[mid + 1] || 0) <= offsetPx) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  };

  useEffect(() => {
    setVisibleRange({ start: 0, end: Math.max(0, Math.min(totalItems - 1, 15)) });
  }, [totalItems]);

  useEffect(() => {
    setRowHeights((prev) => Array.from({ length: totalRows }, (_, index) => (
      Math.max(120, Number(prev[index] || rowHeight))
    )));
  }, [totalRows, rowHeight, cols]);

  useEffect(() => {
    if (!shouldVirtualize) {
      setIsNearViewport(true);
      return undefined;
    }
    const node = hostRef.current;
    if (!node || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      setIsNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsNearViewport(Boolean(entry?.isIntersecting));
      },
      { root: null, rootMargin: '1200px 0px 1200px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldVirtualize]);

  useEffect(() => {
    if (!shouldVirtualize || !isNearViewport) return undefined;
    const node = hostRef.current;
    if (!node || typeof window === 'undefined') return undefined;
    let frameId = 0;
    const overscanRows = 3;

    const computeRange = () => {
      frameId = 0;
      const componentTop = window.scrollY + node.getBoundingClientRect().top;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const visibleTopPx = Math.max(0, viewportTop - componentTop);
      const visibleBottomPx = Math.min(totalHeight, viewportBottom - componentTop);
      const startRow = Math.max(0, findRowIndexAtOffset(visibleTopPx) - overscanRows);
      const endRow = Math.min(totalRows - 1, findRowIndexAtOffset(Math.max(0, visibleBottomPx)) + overscanRows);
      const nextStart = Math.max(0, startRow * cols);
      const nextEnd = Math.min(totalItems - 1, ((endRow + 1) * cols) - 1);
      setVisibleRange((prev) => {
        if (prev.start === nextStart && prev.end === nextEnd) return prev;
        return { start: nextStart, end: nextEnd };
      });
    };

    const scheduleCompute = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(computeRange);
    };

    scheduleCompute();
    window.addEventListener('scroll', scheduleCompute, { passive: true });
    window.addEventListener('resize', scheduleCompute);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', scheduleCompute);
      window.removeEventListener('resize', scheduleCompute);
    };
  }, [shouldVirtualize, isNearViewport, totalRows, totalHeight, cols, totalItems, rowOffsets]);

  useLayoutEffect(() => {
    if (!shouldVirtualize || !isNearViewport || totalItems === 0) return undefined;

    const measureVisibleRows = () => {
      const measuredByRow = new Map();
      itemRefs.current.forEach((node, indexKey) => {
        const absoluteIndex = Number(indexKey);
        if (!node || absoluteIndex < visibleRange.start || absoluteIndex > visibleRange.end) return;
        const measuredHeight = Math.ceil(node.getBoundingClientRect().height || 0);
        if (!measuredHeight) return;
        const rowIndex = Math.floor(absoluteIndex / cols);
        measuredByRow.set(rowIndex, Math.max(measuredByRow.get(rowIndex) || 0, measuredHeight));
      });
      if (measuredByRow.size === 0) return;

      setRowHeights((prev) => {
        let changed = false;
        const next = prev.length === totalRows
          ? [...prev]
          : Array.from({ length: totalRows }, (_, index) => Math.max(120, Number(prev[index] || rowHeight)));
        measuredByRow.forEach((measuredHeight, rowIndex) => {
          const stableHeight = Math.max(120, measuredHeight);
          if (Math.abs(Number(next[rowIndex] || rowHeight) - stableHeight) > 1) {
            next[rowIndex] = stableHeight;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };

    measureVisibleRows();
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') return undefined;
    const observer = new window.ResizeObserver(() => measureVisibleRows());
    itemRefs.current.forEach((node, indexKey) => {
      const absoluteIndex = Number(indexKey);
      if (node && absoluteIndex >= visibleRange.start && absoluteIndex <= visibleRange.end) {
        observer.observe(node);
      }
    });
    return () => observer.disconnect();
  }, [shouldVirtualize, isNearViewport, totalItems, visibleRange.start, visibleRange.end, cols, totalRows, rowHeight]);

  if (!shouldVirtualize) {
    return (
      <div ref={hostRef} className="virtual-grid-host">
        <div className="group-products-grid">
          {families.map((family) => renderFamilyCard(family))}
        </div>
      </div>
    );
  }

  if (!isNearViewport) {
    return (
      <div ref={hostRef} className="virtual-grid-host">
        <div className="virtual-grid-placeholder" style={{ height: `${totalHeight}px` }} aria-hidden="true" />
      </div>
    );
  }

  const windowedFamilies = families.slice(visibleRange.start, visibleRange.end + 1);

  return (
    <div ref={hostRef} className="virtual-grid-host">
      <div className="virtual-grid-window" style={{ height: `${totalHeight}px` }}>
        <div
          className="group-products-grid virtual-grid-windowed-content"
          style={{ transform: `translateY(${virtualWindowOffset}px)` }}
        >
          {windowedFamilies.map((family, index) => {
            const absoluteIndex = visibleRange.start + index;
            return (
              <div
                key={family.id || family.name || absoluteIndex}
                className="virtual-grid-item"
                ref={(node) => {
                  if (node) {
                    itemRefs.current.set(absoluteIndex, node);
                  } else {
                    itemRefs.current.delete(absoluteIndex);
                  }
                }}
              >
                {renderFamilyCard(family)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default VirtualizedFamilyGrid;

