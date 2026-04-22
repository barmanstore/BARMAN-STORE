import { AlertTriangle, Inbox, Search, FileText, Lock, Clock } from 'lucide-react';
import EmptyState from './EmptyState';

export default {
  title: 'Shared/EmptyState',
  component: EmptyState,
  args: {
    eyebrow: 'Status',
    title: 'No records found',
    description: 'Add a new item or adjust your filters to see results here.',
  },
  argTypes: {
    eyebrow: { control: 'text' },
    title: { control: 'text' },
    description: { control: 'text' },
  },
};

export const Default = {
  args: {
    icon: <Inbox size={20} />,
  },
};

export const WithAction = {
  args: {
    title: 'No saved drafts',
    description: 'Save a draft to reopen it later from the workspace.',
    icon: <Inbox size={20} />,
    actions: <button type="button" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-primary)', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>Create draft</button>,
  },
};

export const Loading = {
  args: {
    eyebrow: 'Loading',
    title: 'Working on it',
    description: 'This is a loading placeholder for async screens.',
    icon: <Clock size={20} />,
  },
};

export const Error = {
  args: {
    eyebrow: 'Attention',
    title: 'Something needs review',
    description: 'This state is useful for issue and exception screens.',
    icon: <AlertTriangle size={20} />,
  },
};

export const NoSearch = {
  args: {
    eyebrow: 'Not Found',
    title: 'No matches found',
    description: "Try adjusting your search terms or filters to find what you're looking for.",
    icon: <Search size={20} />,
  },
};

export const NoPermission = {
  args: {
    eyebrow: 'Access Denied',
    title: "You don't have access",
    description: 'Contact your administrator to request permission for this feature.',
    icon: <Lock size={20} />,
  },
};

export const NoDocuments = {
  args: {
    eyebrow: 'Empty',
    title: 'No documents available',
    description: 'Upload your first document to get started.',
    icon: <FileText size={20} />,
    actions: (
      <button type="button" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-secondary)', color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
        Upload Document
      </button>
    ),
  },
};

export const Multiple = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', padding: '2rem', background: '#faf8f5', minHeight: '100vh' }}>
      <EmptyState
        eyebrow="Empty"
        title="No orders"
        description="Create your first order to get started."
        icon={<Inbox size={24} />}
      />
      <EmptyState
        eyebrow="Error"
        title="Connection failed"
        description="Unable to load data. Please try again."
        icon={<AlertTriangle size={24} />}
      />
      <EmptyState
        eyebrow="Searching"
        title="No results"
        description="Refine your search criteria to find what you need."
        icon={<Search size={24} />}
      />
    </div>
  ),
};

export const WithMultipleActions = {
  args: {
    eyebrow: 'Start Fresh',
    title: "Begin your first project",
    description: "Create a new project or import an existing one to continue.",
    icon: <Inbox size={20} />,
    actions: (
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
          Import
        </button>
        <button type="button" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-primary)', background: 'var(--color-primary)', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
          Create New
        </button>
      </div>
    ),
  },
};
