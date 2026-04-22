import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

const normalizeQuery = (value) =>
  String(value || '')
    .trim()
    .slice(0, 80);

function HeaderSearchBar({ className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState('');

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!location.pathname.startsWith('/products')) return;
    const params = new URLSearchParams(location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(String(params.get('q') || ''));
  }, [location.pathname, location.search]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const query = normalizeQuery(value);
    if (query) {
      navigate(`/products?q=${encodeURIComponent(query)}`);
      return;
    }
    navigate('/products');
  };

  return (
    <form className={`header-search ${className}`.trim()} role="search" onSubmit={handleSubmit}>
      <Search size={16} />
      <input
        id="header-search"
        name="search"
        type="search"
        placeholder="Search products, orders…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Search products"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
      />
    </form>
  );
}

export default HeaderSearchBar;
