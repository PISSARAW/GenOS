'use strict';

const values = require('../trinityProvenanceValues');
const BINARY = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
  '/': (a, b) => a / b, '%': (a, b) => a % b };
const CALLS = { abs: Math.abs, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil };

function evaluate(node, input, budget) {
  budget.remaining -= 1;
  if (budget.remaining < 0) throw values.failure('CODE_EXPRESSION_BUDGET_EXCEEDED');
  if (node.type === 'number') return node.value;
  if (node.type === 'input') return input[node.name];
  if (node.type === 'unary') {
    const value = evaluate(node.value, input, budget);
    return node.operator === '-' ? -value : value;
  }
  if (node.type === 'binary') return BINARY[node.operator](evaluate(node.left, input, budget), evaluate(node.right, input, budget));
  if (node.type === 'call') return CALLS[node.name](...node.args.map(arg => evaluate(arg, input, budget)));
  throw values.failure('CODE_EXPRESSION_GRAMMAR_INVALID');
}

function execute(tree, input) {
  const result = evaluate(tree, input, { remaining: 180 });
  if (!Number.isFinite(result)) throw values.failure('CODE_EXPRESSION_OUTPUT_INVALID');
  return result;
}

module.exports = { execute };
