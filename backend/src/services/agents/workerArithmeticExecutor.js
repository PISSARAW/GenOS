'use strict';

const { methodInput, error, receipt } = require('./workerNativeEvidence');

const EXPRESSION = '\\d+(?:\\s*[+*%]\\s*\\d+)*';
const CLAIM = new RegExp(`^\\s*(${EXPRESSION})\\s*(<=|>=|≤|≥|=|<|>)\\s*(${EXPRESSION})\\s*$`, 'u');
const COMPARISONS = {
  '=': (a, b) => a === b, '<': (a, b) => a < b, '>': (a, b) => a > b,
  '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '≤': (a, b) => a <= b, '≥': (a, b) => a >= b
};

function assertArithmeticInput(method) {
  const { claim } = methodInput(method, 'check_arithmetic');
  if (typeof claim !== 'string' || claim.length > 512 || !CLAIM.test(claim)) {
    throw error('WORKER_FORMAL_INPUT_INVALID', 'Use a bounded closed natural-number arithmetic comparison.');
  }
  return true;
}

function multiply(tokens, steps) {
  let value = BigInt(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const right = BigInt(tokens[i + 1]);
    const operator = tokens[i];
    const previous = value;
    if (operator === '%' && right === 0n) throw error('WORKER_FORMAL_INPUT_INVALID', 'Remainder by zero is undefined.');
    value = operator === '*' ? value * right : value % right;
    steps.push({ left: String(previous), operator, right: String(right), result: String(value) });
  }
  return value;
}

function evaluate(expression) {
  const steps = [];
  const values = expression.split('+').map((term) => multiply(term.match(/\d+|[*%]/g), steps));
  const value = values.reduce((total, item) => total + item, 0n);
  return { value, steps, sumTerms: values.map(String) };
}

function runArithmetic(method) {
  assertArithmeticInput(method);
  const claim = method.parameters.claim.trim();
  const [, leftExpression, comparator, rightExpression] = claim.match(CLAIM);
  const left = evaluate(leftExpression);
  const right = evaluate(rightExpression);
  if (!COMPARISONS[comparator](left.value, right.value)) {
    throw error('WORKER_FORMAL_CHECK_FAILED', 'The closed arithmetic proposition is false.');
  }
  const derivation = { left: { ...left, value: String(left.value) },
    right: { ...right, value: String(right.value) }, comparator };
  const executionReceipt = receipt(method, derivation);
  const solver = 'GenOS NatArithmetic v1';
  const content = { claim, solver, result: 'proved', derivation,
    solverReceipt: { ...executionReceipt, claim, solver, result: 'proved', evidence: [executionReceipt.id] } };
  return content;
}

module.exports = { assertArithmeticInput, runArithmetic };
