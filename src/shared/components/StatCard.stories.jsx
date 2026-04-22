import { Package, ShoppingBag, TrendingUp, Wallet, AlertCircle, CheckCircle } from 'lucide-react';
import StatCard from './StatCard';

export default {
  title: 'Shared/StatCard',
  component: StatCard,
  parameters: {
    layout: 'centered',
  },
};

export function Default() {
  return (
    <StatCard
      icon={<ShoppingBag size={15} aria-hidden="true" />}
      label="Total Orders"
      value="128"
      hint="All saved order records"
      tone="sky"
    />
  );
}

export function Inventory() {
  return (
    <StatCard
      icon={<Package size={15} aria-hidden="true" />}
      label="Low Stock"
      value="24"
      hint="Needs restock attention"
      tone="amber"
    />
  );
}

export function Revenue() {
  return (
    <StatCard
      icon={<TrendingUp size={15} aria-hidden="true" />}
      label="Revenue"
      value="₹42.8L"
      hint="Across the selected range"
      tone="emerald"
    />
  );
}

export function Balance() {
  return (
    <StatCard
      icon={<Wallet size={15} aria-hidden="true" />}
      label="Balance"
      value="₹18,420"
      hint="Cash and ledger view"
      tone="violet"
    />
  );
}

export function AllTones() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', padding: '1rem' }}>
      <StatCard
        icon={<ShoppingBag size={15} aria-hidden="true" />}
        label="Sky Tone"
        value="256"
        hint="Example with sky accent"
        tone="sky"
      />
      <StatCard
        icon={<Package size={15} aria-hidden="true" />}
        label="Amber Tone"
        value="89"
        hint="Example with amber accent"
        tone="amber"
      />
      <StatCard
        icon={<TrendingUp size={15} aria-hidden="true" />}
        label="Emerald Tone"
        value="₹125K"
        hint="Example with emerald accent"
        tone="emerald"
      />
      <StatCard
        icon={<Wallet size={15} aria-hidden="true" />}
        label="Violet Tone"
        value="₹92.5K"
        hint="Example with violet accent"
        tone="violet"
      />
      <StatCard
        icon={<AlertCircle size={15} aria-hidden="true" />}
        label="Rose Tone"
        value="12"
        hint="Example with rose accent"
        tone="rose"
      />
    </div>
  );
}

export function Compact() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', padding: '1rem', maxWidth: '400px' }}>
      <StatCard
        icon={<ShoppingBag size={14} aria-hidden="true" />}
        label="Orders"
        value="512"
        tone="sky"
      />
      <StatCard
        icon={<Package size={14} aria-hidden="true" />}
        label="Stock"
        value="1.2K"
        tone="emerald"
      />
      <StatCard
        icon={<TrendingUp size={14} aria-hidden="true" />}
        label="Growth"
        value="+24%"
        tone="amber"
      />
      <StatCard
        icon={<Wallet size={14} aria-hidden="true" />}
        label="Wallet"
        value="₹5.2L"
        tone="violet"
      />
    </div>
  );
}

export function WithoutIcon() {
  return (
    <StatCard
      label="Pending Tasks"
      value="18"
      hint="Awaiting action"
      tone="amber"
    />
  );
}

export function Dashboard() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', padding: '1.5rem', background: '#faf8f5', borderRadius: '1rem' }}>
      <StatCard
        icon={<CheckCircle size={15} aria-hidden="true" />}
        label="Completed"
        value="94%"
        hint="Q1 2026 Target"
        tone="emerald"
      />
      <StatCard
        icon={<AlertCircle size={15} aria-hidden="true" />}
        label="At Risk"
        value="6%"
        hint="Needs attention"
        tone="amber"
      />
      <StatCard
        icon={<ShoppingBag size={15} aria-hidden="true" />}
        label="New Orders"
        value="328"
        hint="This month"
        tone="sky"
      />
      <StatCard
        icon={<TrendingUp size={15} aria-hidden="true" />}
        label="Revenue"
        value="₹52L"
        hint="Month-to-date"
        tone="violet"
      />
    </div>
  );
}
