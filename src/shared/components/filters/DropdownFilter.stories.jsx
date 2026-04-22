import { useState } from 'react';
import DropdownFilter from './DropdownFilter';

const meta = {
  title: 'Shared/DropdownFilter',
  component: DropdownFilter,
  args: {
    label: 'Status',
    options: ['Draft', 'Active', 'Archived'],
    selectedItems: [],
    tone: 'sky',
  },
  argTypes: {
    label: { control: 'text' },
    tone: {
      control: 'select',
      options: ['sky', 'amber', 'emerald', 'violet', 'slate'],
    },
    multiSelect: { control: 'boolean' },
    multiSelectMode: { control: 'select', options: ['pills', 'checklist'] },
    showSelectedCount: { control: 'boolean' },
    showBullets: { control: 'boolean' },
  },
};

export default meta;

function ControlledDropdownFilter(args) {
  const [selectedItems, setSelectedItems] = useState(args.selectedItems || []);

  return (
    <div style={{ padding: '1rem', width: '360px' }}>
      <DropdownFilter {...args} selectedItems={selectedItems} onChange={setSelectedItems} />
    </div>
  );
}

export const Default = {
  render: (args) => <ControlledDropdownFilter {...args} />,
};

export const Checklist = {
  args: {
    multiSelect: true,
    multiSelectMode: 'checklist',
    showSelectedCount: true,
    showBullets: true,
  },
  render: (args) => <ControlledDropdownFilter {...args} />,
};

export const Pills = {
  args: {
    multiSelect: true,
    multiSelectMode: 'pills',
    showSelectedCount: false,
    options: ['Draft', 'Pending', 'Published', 'Archived'],
  },
  render: (args) => <ControlledDropdownFilter {...args} />,
};

export const PillsWithPreselection = {
  args: {
    multiSelect: true,
    multiSelectMode: 'pills',
    showSelectedCount: true,
    options: ['Draft', 'Pending', 'Published', 'Archived'],
    selectedItems: ['Draft', 'Published'],
  },
  render: (args) => <ControlledDropdownFilter {...args} />,
};

export const AllTones = {
  render: (args) => (
    <div style={{ display: 'grid', gap: '2rem', padding: '1rem' }}>
      {['sky', 'amber', 'emerald', 'violet', 'slate'].map((tone) => (
        <div key={tone}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: '#666' }}>
            {tone.charAt(0).toUpperCase() + tone.slice(1)}
          </p>
          <ControlledDropdownFilter
            {...args}
            tone={tone}
            label={`Filter by ${tone}`}
            options={['Option A', 'Option B', 'Option C']}
            multiSelect
            multiSelectMode="pills"
            showSelectedCount={true}
          />
        </div>
      ))}
    </div>
  ),
};

export const PillsMobile = {
  args: {
    multiSelect: true,
    multiSelectMode: 'pills',
    showSelectedCount: true,
    options: ['Draft', 'Pending', 'Published', 'Archived', 'Scheduled'],
    selectedItems: ['Published'],
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
  render: (args) => <ControlledDropdownFilter {...args} />,
};

export const PillsCompact = {
  args: {
    multiSelect: true,
    multiSelectMode: 'pills',
    showSelectedCount: false,
    options: ['Active', 'Inactive', 'Pending'],
    label: 'Status',
    tone: 'emerald',
  },
  render: (args) => (
    <div style={{ padding: '1rem', width: '280px' }}>
      <DropdownFilter {...args} />
    </div>
  ),
};
