import { memo } from 'react';

function OfferField({ label, htmlFor, hint = '', required = false, wide = false, children }) {
  return (
    <div className={`offer-field${wide ? ' offer-field--wide' : ''}`}>
      <label className="form-label offer-field-label" htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? <span className="offer-required-chip">Required</span> : null}
      </label>
      {children}
      {hint ? <p className="offer-helper">{hint}</p> : null}
    </div>
  );
}

export default memo(OfferField);
