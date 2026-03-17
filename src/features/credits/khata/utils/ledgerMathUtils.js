const tokenizeMathExpression = (raw) => {
  const value = String(raw || '').replace(/,/g, '').trim();
  if (!value) return [];
  if (!/^[\d+\-*/().\s]+$/.test(value)) {
    throw new Error('Only numbers and + - * / ( ) are allowed');
  }
  const tokens = [];
  const compact = value.replace(/\s+/g, '');
  let i = 0;
  while (i < compact.length) {
    const ch = compact[i];
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < compact.length && /[\d.]/.test(compact[j])) j += 1;
      const numText = compact.slice(i, j);
      if (!/^\d*\.?\d+$/.test(numText)) throw new Error('Invalid number format');
      const num = Number(numText);
      if (!Number.isFinite(num)) throw new Error('Invalid number');
      tokens.push(num);
      i = j;
      continue;
    }
    throw new Error('Invalid expression');
  }
  return tokens;
};

const evaluateMathExpression = (raw) => {
  const tokens = tokenizeMathExpression(raw);
  if (!tokens.length) return { valid: false, value: 0, message: '' };
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const output = [];
  const ops = [];
  tokens.forEach((token) => {
    if (typeof token === 'number') {
      output.push(token);
      return;
    }
    if (token === '(') {
      ops.push(token);
      return;
    }
    if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop());
      if (ops.pop() !== '(') throw new Error('Mismatched parentheses');
      return;
    }
    while (ops.length && prec[ops[ops.length - 1]] >= prec[token]) output.push(ops.pop());
    ops.push(token);
  });
  while (ops.length) {
    const op = ops.pop();
    if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
    output.push(op);
  }
  const stack = [];
  output.forEach((token) => {
    if (typeof token === 'number') {
      stack.push(token);
      return;
    }
    const b = Number(stack.pop());
    const a = Number(stack.pop());
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid expression');
    if (token === '+') stack.push(a + b);
    else if (token === '-') stack.push(a - b);
    else if (token === '*') stack.push(a * b);
    else if (token === '/') {
      if (b === 0) throw new Error('Cannot divide by zero');
      stack.push(a / b);
    }
  });
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('Invalid expression');
  return { valid: true, value: stack[0], message: '' };
};

export { evaluateMathExpression };
