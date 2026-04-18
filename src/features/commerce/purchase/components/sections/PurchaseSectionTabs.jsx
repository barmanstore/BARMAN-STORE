import { BellRing, Package, RotateCcw, Wallet } from 'lucide-react';

const PurchaseSectionTabs = ({ activeTab, onChange, counts = {} }) => {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: Package },
    { key: 'orders', label: 'Orders', icon: Package },
    { key: 'payments', label: 'Payments', icon: Wallet },
    { key: 'reminders', label: 'Reminders', icon: BellRing, count: counts.reminders },
    { key: 'returns', label: 'Returns', icon: RotateCcw, count: counts.returns },
  ];

  return (
    <div className="sub-nav purchase-section-nav" role="tablist" aria-label="Purchase sections">
      {items.map((item) => {
        const Icon = item.icon;
        const count = Number(item.count || 0);
        return (
          <button
            key={item.key}
            type="button"
            className={activeTab === item.key ? 'active' : ''}
            onClick={() => onChange(item.key)}
            role="tab"
            aria-selected={activeTab === item.key}
          >
            <Icon size={18} />
            <span>{item.label}</span>
            {count > 0 ? <small>{count}</small> : null}
          </button>
        );
      })}
    </div>
  );
};

export default PurchaseSectionTabs;
