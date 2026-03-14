import { useEffect, useState } from 'react';
import MobileAccountHeader from './MobileAccountHeader';
import MobileFooter from './MobileFooter';
import './MobileAccountLayout.css';

const getCartCountFromStorage = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('barman_cart') || '[]');
    const rows = Array.isArray(saved) ? saved : [];
    return rows.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
  } catch (_) {
    return 0;
  }
};

function MobileAccountLayout({ children }) {
  const [cartCount, setCartCount] = useState(() => getCartCountFromStorage());

  useEffect(() => {
    const syncCart = () => setCartCount(getCartCountFromStorage());
    syncCart();
    window.addEventListener('storage', syncCart);
    return () => window.removeEventListener('storage', syncCart);
  }, []);

  return (
    <div className="mobile-account-layout">
      <MobileAccountHeader />
      {children}
      <MobileFooter cartCount={cartCount} />
    </div>
  );
}

export default MobileAccountLayout;
