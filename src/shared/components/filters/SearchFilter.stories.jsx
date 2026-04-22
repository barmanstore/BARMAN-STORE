import { useState } from 'react';
import SearchFilter from './SearchFilter';

const meta = {
  title: 'Shared/SearchFilter',
  component: SearchFilter,
  args: {
    placeholder: 'Search products',
    value: '',
    tone: 'sky',
  },
  argTypes: {
    placeholder: { control: 'text' },
    value: { control: 'text' },
    tone: {
      control: 'select',
      options: ['sky', 'amber', 'emerald', 'violet', 'slate'],
    },
  },
};

export default meta;

function ControlledSearchFilter(args) {
  const [value, setValue] = useState(args.value || '');

  return (
    <div style={{ padding: '1rem' }}>
      <SearchFilter
        {...args}
        value={value}
        onChange={setValue}
        onSubmit={(submitted) => {
          setValue(submitted);
        }}
      />
    </div>
  );
}

export const Default = {
  render: (args) => <ControlledSearchFilter {...args} />,
};

export const WithScope = {
  args: {
    placeholder: 'Search purchase orders',
    scopeOptions: ['PO #', 'Supplier', 'Status'],
    scopeValue: 'PO #',
    width: '520px',
  },
  render: (args) => <ControlledSearchFilter {...args} />,
};

export const SubmitButton = {
  args: {
    placeholder: 'Search bills',
    width: '360px',
  },
  render: (args) => <ControlledSearchFilter {...args} />,
};

export const AllTones = {
  render: (args) => (
    <div style={{ display: 'grid', gap: '1.5rem', padding: '1rem' }}>
      {['sky', 'amber', 'emerald', 'violet', 'slate'].map((tone) => (
        <div key={tone}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: '#666' }}>
            {tone.charAt(0).toUpperCase() + tone.slice(1)}
          </p>
          <ControlledSearchFilter
            {...args}
            tone={tone}
            placeholder={`Search with ${tone} tone`}
            width="420px"
          />
        </div>
      ))}
    </div>
  ),
};

export const WithValue = {
  args: {
    placeholder: 'Search products',
    value: 'Organic Rice',
    width: '380px',
  },
  render: (args) => <ControlledSearchFilter {...args} />,
};

export const FullWidth = {
  args: {
    placeholder: 'Search across all orders',
    width: '100%',
  },
  render: (args) => (
    <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '0.5rem' }}>
      <ControlledSearchFilter {...args} />
    </div>
  ),
};

export const Compact = {
  args: {
    placeholder: 'Quick search',
    width: '240px',
    tone: 'violet',
  },
  render: (args) => <ControlledSearchFilter {...args} />,
};
