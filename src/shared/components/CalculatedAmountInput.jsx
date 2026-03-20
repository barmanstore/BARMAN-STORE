import { useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import { shouldShowAmountFeedback, validateAmountInput } from '../utils/amountExpression';
import './CalculatedAmountInput.css';

function CalculatedAmountInput({
  id,
  name,
  value,
  onValueChange,
  placeholder = 'Enter amount or expression',
  required = false,
  disabled = false,
  readOnly = false,
  autoComplete = 'off',
  min = 0.01,
  max = null,
  precision = 2,
  className = '',
  inputClassName = '',
  previewClassName = '',
  showPreview = true,
}) {
  const evaluation = useMemo(
    () => validateAmountInput(value, { min, max, precision }),
    [value, min, max, precision]
  );
  const hasValue = String(value ?? '').trim() !== '';
  const showFeedback = showPreview && hasValue && shouldShowAmountFeedback(value, evaluation);
  const describedBy = showFeedback ? `${id}-calculated-feedback` : undefined;

  return (
    <div
      className={[
        'calculated-amount-input',
        showFeedback && !evaluation.valid ? 'has-error' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <input
        id={id}
        name={name}
        type="text"
        inputMode="text"
        pattern="[-+*/()., 0-9]*"
        value={value ?? ''}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoComplete={autoComplete}
        className={inputClassName}
        aria-invalid={showFeedback && !evaluation.valid ? true : undefined}
        aria-describedby={describedBy}
      />
      {showFeedback ? (
        <div
          id={`${id}-calculated-feedback`}
          className={[
            'calculated-amount-input-preview',
            evaluation.valid ? 'ok' : 'error',
            previewClassName,
          ].filter(Boolean).join(' ')}
        >
          {evaluation.valid ? `Calculated: ${formatCurrency(evaluation.value)}` : evaluation.message}
        </div>
      ) : null}
    </div>
  );
}

export default CalculatedAmountInput;
