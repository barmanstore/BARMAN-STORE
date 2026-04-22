import { useState } from 'react';
import DateRangeFilter from './DateRangeFilter';

const PRESETS = [
  { label: 'Today', value: ['2026-04-18', '2026-04-18'] },
  { label: 'Last 7 Days', value: ['2026-04-12', '2026-04-18'] },
  { label: 'This Month', value: ['2026-04-01', '2026-04-18'] },
];

function ControlledDateRangeFilter(args) {
  const [value, setValue] = useState(args.value || ['', '']);
  return <DateRangeFilter {...args} value={value} onChange={setValue} />;
}

export default {
  title: 'Shared/DateRangeFilter',
  component: DateRangeFilter,
  parameters: {
    layout: 'centered',
  },
};

export function Default() {
  return (
    <ControlledDateRangeFilter
      label="Date Range"
      helperText="Transaction date"
      presets={PRESETS}
      tone="sky"
    />
  );
}

export function AlwaysOpen() {
  return (
    <DateRangeFilter
      label="Date Range"
      helperText="Preset-first picker"
      presets={PRESETS}
      tone="sky"
      alwaysOpen
      value={['2026-04-12', '2026-04-18']}
    />
  );
}

export function IconTrigger() {
  return (
    <ControlledDateRangeFilter
      label="Date Range"
      helperText="Compact trigger"
      presets={PRESETS}
      tone="violet"
      triggerMode="icon"
      value={['2026-04-18', '2026-04-18']}
    />
  );
}

export function AllTones() {
  return (
    <div style={{ display: 'grid', gap: '2rem', padding: '1rem' }}>
      {['sky', 'amber', 'emerald', 'violet', 'slate'].map((tone) => (
        <div key={tone}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: '#666' }}>
            {tone.charAt(0).toUpperCase() + tone.slice(1)}
          </p>
          <ControlledDateRangeFilter
            label={`Date Range - ${tone}`}
            helperText={`Select range with ${tone} accent`}
            presets={PRESETS}
            tone={tone}
          />
        </div>
      ))}
    </div>
  );
}

export function WithPreselection() {
  return (
    <ControlledDateRangeFilter
      label="Report Period"
      helperText="Q1 2026 financials"
      presets={PRESETS}
      tone="emerald"
      value={['2026-01-01', '2026-03-31']}
    />
  );
}

export function CompactMode() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '1rem' }}>
      <ControlledDateRangeFilter
        label="From"
        presets={PRESETS}
        tone="sky"
        triggerMode="icon"
      />
      <ControlledDateRangeFilter
        label="To"
        presets={PRESETS}
        tone="sky"
        triggerMode="icon"
      />
    </div>
  );
}

export function MultipleFilters() {
  return (
    <div style={{ display: 'grid', gap: '1.5rem', padding: '2rem', background: '#faf8f5', borderRadius: '1rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#333' }}>Date Range Filters</h3>
      <ControlledDateRangeFilter
        label="Transaction Date"
        helperText="Filter by transaction date"
        presets={PRESETS}
        tone="sky"
      />
      <ControlledDateRangeFilter
        label="Posting Date"
        helperText="Filter by posting date"
        presets={PRESETS}
        tone="violet"
      />
      <ControlledDateRangeFilter
        label="Delivery Date"
        helperText="Filter by delivery date"
        presets={PRESETS}
        tone="emerald"
      />
    </div>
  );
}
