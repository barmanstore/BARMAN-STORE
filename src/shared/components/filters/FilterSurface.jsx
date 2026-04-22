import { forwardRef } from 'react';
import './FilterSurface.css';

function FilterBar({ children, className = '' }) {
  const classes = ['ui-filter-bar', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

const FilterTray = forwardRef(function FilterTray(
  { children, className = '', id = null, hidden = false },
  ref
) {
  const classes = ['ui-filter-tray', className].filter(Boolean).join(' ');
  return (
    <div ref={ref} id={id || undefined} className={classes} hidden={hidden}>
      {children}
    </div>
  );
});

function FilterRow({ label, children, className = '' }) {
  const classes = ['ui-filter-row', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <span className="ui-filter-row__label">{label}</span>
      <div className="ui-filter-row__control">{children}</div>
    </div>
  );
}

function FilterPills({ items = [], className = '', ariaLabel = 'Active filters' }) {
  const classes = ['ui-filter-pills', className].filter(Boolean).join(' ');
  if (!items.length) return null;

  return (
    <div className={classes} aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`ui-filter-pill${item.tone ? ` ui-filter-pill--${item.tone}` : ''}`}
          onClick={item.onClear}
        >
          {item.icon ? <span className="ui-filter-pill__icon">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export { FilterBar, FilterTray, FilterRow, FilterPills };
