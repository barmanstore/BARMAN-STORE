import React from 'react';
import { formatCurrency, getSignedCurrencyClassName } from '../../../utils/formatters';

const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

export { formatCurrencyColored };
