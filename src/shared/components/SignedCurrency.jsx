import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';

function SignedCurrency({ amount, className = '' }) {
  const normalized = Number(amount);
  const safeAmount = Number.isFinite(normalized) ? normalized : 0;
  const combinedClassName = [getSignedCurrencyClassName(safeAmount), className].filter(Boolean).join(' ');

  return (
    <span className={combinedClassName}>
      {formatCurrency(Math.abs(safeAmount))}
    </span>
  );
}

export default SignedCurrency;
