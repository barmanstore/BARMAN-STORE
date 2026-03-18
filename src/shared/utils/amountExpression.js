import { formatCurrency } from './formatters.js';

const isOperator = (token) => token === '+' || token === '-' || token === '*' || token === '/';

const isValidWesternGrouping = (segments) => (
  segments.length > 1
  && segments[0].length >= 1
  && segments[0].length <= 3
  && segments.slice(1).every((segment) => segment.length === 3)
);

const isValidIndianGrouping = (segments) => (
  segments.length > 1
  && segments[segments.length - 1].length === 3
  && segments[0].length >= 1
  && segments[0].length <= 3
  && segments.slice(1, -1).every((segment) => segment.length === 2)
);

const normalizeGroupedIntegerPart = (raw) => {
  const value = String(raw ?? '');
  if (!value) return '0';

  if (!value.includes(',')) {
    if (!/^\d+$/.test(value)) throw new Error('Invalid number format');
    return value;
  }

  const segments = value.split(',');
  if (segments.some((segment) => segment.length === 0 || !/^\d+$/.test(segment))) {
    throw new Error('Invalid number format');
  }
  if (!isValidWesternGrouping(segments) && !isValidIndianGrouping(segments)) {
    throw new Error('Invalid comma placement');
  }

  return segments.join('');
};

const parseNumericToken = (rawToken) => {
  const value = String(rawToken || '').trim();
  if (!value) throw new Error('Invalid number');

  const sign = value[0] === '-' || value[0] === '+' ? value[0] : '';
  const unsignedValue = sign ? value.slice(1) : value;
  if (!unsignedValue) throw new Error('Invalid number');

  const parts = unsignedValue.split('.');
  if (parts.length > 2) throw new Error('Invalid number format');

  const [integerPartRaw, fractionalPart = ''] = parts;
  if (!integerPartRaw && !fractionalPart) throw new Error('Invalid number');
  if (fractionalPart && !/^\d+$/.test(fractionalPart)) throw new Error('Invalid number format');

  const normalizedIntegerPart = integerPartRaw ? normalizeGroupedIntegerPart(integerPartRaw) : '0';
  const normalizedValue = `${sign}${normalizedIntegerPart}${fractionalPart ? `.${fractionalPart}` : ''}`;
  const numberValue = Number(normalizedValue);
  if (!Number.isFinite(numberValue)) throw new Error('Invalid number');

  return numberValue;
};

const tokenizeAmountExpression = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return [];
  if (!/^[\d+\-*/().,\s]+$/.test(value)) {
    throw new Error('Only numbers and + - * / ( ) are allowed');
  }

  const compact = value.replace(/\s+/g, '');
  const tokens = [];
  let i = 0;

  while (i < compact.length) {
    const ch = compact[i];
    const previousToken = tokens[tokens.length - 1];
    const unaryContext = (ch === '+' || ch === '-')
      && (tokens.length === 0 || previousToken === '(' || isOperator(previousToken));

    if (unaryContext && compact[i + 1] === '(') {
      tokens.push(0);
      tokens.push(ch);
      i += 1;
      continue;
    }

    const startsSignedNumber = unaryContext && /[\d.,]/.test(compact[i + 1] || '');
    if (startsSignedNumber || /[\d.,]/.test(ch)) {
      let j = i + (startsSignedNumber ? 1 : 0);
      while (j < compact.length && /[\d.,]/.test(compact[j])) j += 1;
      tokens.push(parseNumericToken(compact.slice(i, j)));
      i = j;
      continue;
    }

    if (isOperator(ch) || ch === '(' || ch === ')') {
      tokens.push(ch);
      i += 1;
      continue;
    }

    throw new Error('Invalid expression');
  }

  return tokens;
};

const roundAmountValue = (value, precision = 2) => Number(Number(value || 0).toFixed(precision));

export const evaluateAmountExpression = (raw) => {
  try {
    const tokens = tokenizeAmountExpression(raw);
    if (!tokens.length) {
      return { valid: false, empty: true, value: 0, message: '' };
    }

    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const output = [];
    const operators = [];

    tokens.forEach((token) => {
      if (typeof token === 'number') {
        output.push(token);
        return;
      }
      if (token === '(') {
        operators.push(token);
        return;
      }
      if (token === ')') {
        while (operators.length && operators[operators.length - 1] !== '(') {
          output.push(operators.pop());
        }
        if (operators.pop() !== '(') throw new Error('Mismatched parentheses');
        return;
      }
      while (
        operators.length
        && precedence[operators[operators.length - 1]] >= precedence[token]
      ) {
        output.push(operators.pop());
      }
      operators.push(token);
    });

    while (operators.length) {
      const token = operators.pop();
      if (token === '(' || token === ')') throw new Error('Mismatched parentheses');
      output.push(token);
    }

    const stack = [];
    output.forEach((token) => {
      if (typeof token === 'number') {
        stack.push(token);
        return;
      }

      const right = Number(stack.pop());
      const left = Number(stack.pop());
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        throw new Error('Invalid expression');
      }

      if (token === '+') stack.push(left + right);
      else if (token === '-') stack.push(left - right);
      else if (token === '*') stack.push(left * right);
      else if (token === '/') {
        if (right === 0) throw new Error('Cannot divide by zero');
        stack.push(left / right);
      }
    });

    if (stack.length !== 1 || !Number.isFinite(stack[0])) {
      throw new Error('Invalid expression');
    }

    return { valid: true, empty: false, value: stack[0], message: '' };
  } catch (error) {
    return {
      valid: false,
      empty: !String(raw || '').trim(),
      value: 0,
      message: error?.message || 'Invalid expression',
    };
  }
};

export const validateAmountInput = (
  raw,
  {
    min = 0.01,
    max = null,
    precision = 2,
  } = {}
) => {
  const evaluation = evaluateAmountExpression(raw);
  if (!evaluation.valid) return evaluation;

  const minValue = Number(min);
  const maxValue = max === null || max === undefined || max === '' ? null : Number(max);
  const roundedValue = roundAmountValue(evaluation.value, precision);
  if (Number.isFinite(minValue) && roundedValue < minValue) {
    return {
      valid: false,
      empty: false,
      value: roundedValue,
      message: `Amount must be at least ${formatCurrency(minValue)}`,
    };
  }
  if (Number.isFinite(maxValue) && roundedValue > maxValue) {
    return {
      valid: false,
      empty: false,
      value: roundedValue,
      message: `Amount cannot exceed ${formatCurrency(maxValue)}`,
    };
  }

  return {
    valid: true,
    empty: false,
    value: roundedValue,
    rawValue: evaluation.value,
    message: '',
  };
};

export const shouldShowAmountFeedback = (raw, evaluation = evaluateAmountExpression(raw)) => {
  const text = String(raw ?? '').trim();
  if (!text) return false;
  if (!evaluation.valid) return true;
  return /[+\-*/(),\s]/.test(text);
};

export { roundAmountValue };
