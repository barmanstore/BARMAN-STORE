import { X } from 'lucide-react';
import { FilterBar, FilterPills, FilterRow, FilterTray } from './FilterSurface';

export default {
  title: 'Shared/FilterSurface',
  component: FilterBar,
  parameters: {
    layout: 'centered',
  },
};

export function Default() {
  return (
    <div style={{ width: 'min(960px, 100vw)', padding: 24 }}>
      <FilterBar>
        <div
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            background: 'var(--color-card)',
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--color-text)',
          }}
        >
          SearchFilter goes here
        </div>
        <button
          type="button"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Filters
        </button>
        <button
          type="button"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </FilterBar>
      <FilterPills
        items={[
          { key: 'status', label: 'Status: Open', onClear: () => {} },
          { key: 'date', label: 'Date: Last 7 Days', onClear: () => {} },
        ]}
      />
      <FilterTray>
        <FilterRow label="Supplier">
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: `1px solid var(--color-border)`,
              background: 'var(--color-card)',
              padding: `${12}px ${16}px`,
              fontSize: '0.875rem',
            }}
          >
            DropdownFilter goes here
          </div>
        </FilterRow>
        <FilterRow label="Date Range">
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: `1px solid var(--color-border)`,
              background: 'var(--color-card)',
              padding: `${12}px ${16}px`,
              fontSize: '0.875rem',
            }}
          >
            DateRangeFilter goes here
          </div>
        </FilterRow>
      </FilterTray>
    </div>
  );
}

export function PillsOnly() {
  return (
    <div style={{ width: 'min(760px, 100vw)', padding: 24 }}>
      <FilterPills
        items={[
          {
            key: 'supplier',
            label: 'Supplier: ACME',
            onClear: () => {},
            icon: <X size={12} aria-hidden="true" />,
          },
          {
            key: 'date',
            label: 'Date: This Month',
            onClear: () => {},
            icon: <X size={12} aria-hidden="true" />,
          },
          {
            key: 'status',
            label: 'Status: Open',
            onClear: () => {},
            icon: <X size={12} aria-hidden="true" />,
          },
        ]}
      />
    </div>
  );
}

export function Mobile() {
  return (
    <div style={{ width: '100%', padding: 24 }}>
      <FilterBar>
        <div
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            background: 'var(--color-card)',
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            flex: 1,
            color: 'var(--color-text)',
          }}
        >
          SearchFilter
        </div>
        <button
          type="button"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
          }}
        >
          Filters
        </button>
      </FilterBar>
    </div>
  );
}

export function WithManyFilters() {
  return (
    <div style={{ width: 'min(1200px, 100vw)', padding: 24 }}>
      <FilterBar>
        <div
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            background: 'var(--color-card)',
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--color-text)',
            flex: 1,
          }}
        >
          Search here
        </div>
        <button
          type="button"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            padding: `${8}px ${16}px`,
            fontSize: '0.875rem',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Advanced
        </button>
      </FilterBar>
      <FilterPills
        items={[
          { key: 'status', label: 'Status: Active', onClear: () => {} },
          { key: 'supplier', label: 'Supplier: ACME', onClear: () => {} },
          { key: 'date', label: 'Date: Last 30 Days', onClear: () => {} },
          { key: 'category', label: 'Category: Food', onClear: () => {} },
          { key: 'price', label: 'Price: ₹100-₹500', onClear: () => {} },
        ]}
      />
      <FilterTray>
        <FilterRow label="Status">
          <div style={{ borderRadius: 'var(--radius-lg)', border: `1px solid var(--color-border)`, background: 'var(--color-card)', padding: `${12}px ${16}px`, fontSize: '0.875rem' }}>
            Multi-select here
          </div>
        </FilterRow>
        <FilterRow label="Supplier">
          <div style={{ borderRadius: 'var(--radius-lg)', border: `1px solid var(--color-border)`, background: 'var(--color-card)', padding: `${12}px ${16}px`, fontSize: '0.875rem' }}>
            Dropdown here
          </div>
        </FilterRow>
        <FilterRow label="Price Range">
          <div style={{ borderRadius: 'var(--radius-lg)', border: `1px solid var(--color-border)`, background: 'var(--color-card)', padding: `${12}px ${16}px`, fontSize: '0.875rem' }}>
            Range slider here
          </div>
        </FilterRow>
      </FilterTray>
    </div>
  );
}

export function Compact() {
  return (
    <div style={{ width: '360px', padding: 16 }}>
      <FilterBar>
        <button
          type="button"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            padding: `${6}px ${12}px`,
            fontSize: '0.8rem',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Filter
        </button>
        <button
          type="button"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: `1px solid var(--color-border)`,
            padding: `${6}px ${12}px`,
            fontSize: '0.8rem',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </FilterBar>
    </div>
  );
}
