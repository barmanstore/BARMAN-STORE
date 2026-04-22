import { Plus, RefreshCw, Download, Filter, Settings, Share2 } from 'lucide-react';
import BackofficePageHeader from './BackofficePageHeader';

export default {
  title: 'Shared/BackofficePageHeader',
  component: BackofficePageHeader,
  args: {
    title: 'Page Title',
    subtitle: 'Short supporting text for the active workspace.',
  },
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text' },
  },
};

export const Default = {};

export const WithActions = {
  args: {
    actions: (
      <>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => (e.target.style.background = '#f5f5f5')}
          onMouseLeave={(e) => (e.target.style.background = 'var(--color-card)')}
        >
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: '#ffffff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(26, 26, 26, 0.15)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => (e.target.style.transform = 'translateY(-2px)', e.target.style.boxShadow = '0 6px 16px rgba(26, 26, 26, 0.2)')}
          onMouseLeave={(e) => (e.target.style.transform = 'translateY(0)', e.target.style.boxShadow = '0 4px 12px rgba(26, 26, 26, 0.15)')}
        >
          <Plus size={16} /> New Item
        </button>
      </>
    ),
  },
};

export const ThreeActions = {
  args: {
    title: 'Inventory Dashboard',
    subtitle: 'Track stock levels and reorder points across all products.',
    actions: (
      <>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Filter size={16} /> Filter
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Download size={16} /> Export
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: '#ffffff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Add Item
        </button>
      </>
    ),
  },
};

export const SingleAction = {
  args: {
    title: 'Reports',
    subtitle: 'View and manage financial reports.',
    actions: (
      <button
        type="button"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.5rem 0.85rem',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-primary)',
          color: '#ffffff',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Download size={16} /> Download
      </button>
    ),
  },
};

export const NoSubtitle = {
  args: {
    title: 'Transactions',
  },
};

export const ComplexHeader = {
  args: {
    title: 'Purchase Orders',
    subtitle: 'Manage purchase orders, approvals, and delivery tracking.',
    actions: (
      <>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Settings size={16} /> Settings
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Share2 size={16} /> Share
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.5rem 0.85rem',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: '#ffffff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} /> New PO
        </button>
      </>
    ),
  },
};
