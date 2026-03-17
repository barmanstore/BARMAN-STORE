import { useState } from 'react';
import { resolveMediaUrl } from '../../../../services/api';

function BrandFilterVisual({ logo, name }) {
  const [failed, setFailed] = useState(false);
  const resolvedName = String(name || '').trim() || 'Brand';
  const resolvedLogo = resolveMediaUrl(logo);
  if (!resolvedLogo || failed) {
    return <span className="brand-chip-name">{resolvedName}</span>;
  }
  return (
    <img
      src={resolvedLogo}
      alt={resolvedName}
      className="brand-chip-logo"
      width={34}
      height={34}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default BrandFilterVisual;

