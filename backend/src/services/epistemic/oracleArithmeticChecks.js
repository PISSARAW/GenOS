'use strict';

const { createHash } = require('node:crypto');

const STRATEGIES = new Set(['arithmetic_term_scan', 'arithmetic_operator_stack']);
const CLAIM = /^\s*(\d+(?:\s*[+*%]\s*\d+)*)\s*(<=|>=|≤|≥|=|<|>)\s*(\d+(?:\s*[+*%]\s*\d+)*)\s*$/u;
const COMPARATORS = { '=': (a, b) => a === b, '<': (a, b) => a < b, '>': (a, b) => a > b,
  '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '≤': (a, b) => a <= b, '≥': (a, b) => a >= b };

function outcome(status, reason, strategy) {
  return { schema: 'genos.arithmetic-postconditions/v1', status, reason, strategy };
}

function scanValue(expression) {
  return expression.split('+').reduce((sum, term) => {
    const tokens = term.match(/\d+|[*%]/gu);
    let value = BigInt(tokens[0]);
    for (let index = 1; index < tokens.length; index += 2) {
      const right = BigInt(tokens[index + 1]);
      value = tokens[index] === '*' ? value * right : value % right;
    }
    return sum + value;
  }, 0n);
}

function stackValue(expression) {
  const tokens = expression.match(/\d+|[+*%]/gu);
  const sums = [];
  let current = BigInt(tokens.shift());
  while (tokens.length) {
    const operator = tokens.shift();
    const right = BigInt(tokens.shift());
    if (operator === '+') { sums.push(current); current = right; }
    else current = operator === '*' ? current * right : current % right;
  }
  return sums.reduce((sum, value) => sum + value, current);
}

function canonicalSide(side) {
  const steps = (side?.steps || []).map(step => ({ left: step.left, operator: step.operator,
    right: step.right, result: step.result }));
  return { value: side?.value, steps, sumTerms: side?.sumTerms };
}

function canonicalDerivation(result) {
  return { left: canonicalSide(result.derivation?.left), right: canonicalSide(result.derivation?.right),
    comparator: result.derivation?.comparator };
}

function receiptMatches(method, result) {
  const canonicalMethod = { version: method.version, methodId: method.methodId,
    parameters: { claim: method.parameters.claim } };
  const input = createHash('sha256').update(JSON.stringify(canonicalMethod)).digest('hex');
  const digest = createHash('sha256').update(JSON.stringify({ inputDigest: input,
    output: canonicalDerivation(result) })).digest('hex');
  const receipt = result.solverReceipt;
  return receipt?.id === `solver://sha256:${digest}` && receipt.inputDigest === `sha256:${input}`
    && receipt.methodId === 'check_arithmetic' && receipt.result === 'proved'
    && receipt.claim === result.claim && receipt.solver === result.solver && receipt.evidence?.includes(receipt.id);
}

function resultMatches(subject, values) {
  const result = subject.result;
  const derivation = result?.derivation;
  return result?.claim === subject.method.parameters.claim.trim()
    && result.solver === 'GenOS NatArithmetic v1' && result.result === 'proved'
    && derivation?.left?.value === String(values.left) && derivation?.right?.value === String(values.right)
    && derivation.comparator === values.comparator && receiptMatches(subject.method, result);
}

function check(subject, strategy) {
  const claim = subject?.method?.parameters?.claim;
  const match = typeof claim === 'string' ? claim.match(CLAIM) : null;
  if (!STRATEGIES.has(strategy) || subject?.method?.methodId !== 'check_arithmetic'
    || subject.method.version !== 1 || !match) return outcome('inconclusive', 'arithmetic_subject_invalid', strategy);
  const evaluate = strategy === 'arithmetic_term_scan' ? scanValue : stackValue;
  const values = { left: evaluate(match[1]), comparator: match[2], right: evaluate(match[3]) };
  const verified = COMPARATORS[values.comparator](values.left, values.right)
    && resultMatches(subject, values);
  return outcome(verified ? 'verified' : 'refuted', 'arithmetic_claim_recomputed', strategy);
}

module.exports = { STRATEGIES, check };
