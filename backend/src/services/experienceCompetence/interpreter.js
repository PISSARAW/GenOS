'use strict';

const { validInteger, validOperator, ruleValid } = require('./contract');

function chain(expression) {
  const result = [];
  let node = expression;
  while (typeof node !== 'number') {
    if (!node || typeof node !== 'object' || !validOperator(node.op) || result.length >= 16) throw Error('Expression outside bounded grammar');
    result.push(node.op);
    node = node.value;
  }
  if (!validInteger(node)) throw Error('Invalid expression input');
  return { operators: result.reverse(), input: node };
}

function admitted(record, samples) {
  if (!record || !ruleValid(record.rule) || record.consolidation?.consolidated !== true) return false;
  if (!Array.isArray(samples) || new Set(samples.map(row => row.x)).size < 3) return false;
  return samples.every(row => record.rule.a * row.x + record.rule.b === row.y);
}

function coverage(state, expression) {
  const parsed = chain(expression);
  const missing = [...new Set(parsed.operators.filter(op => !admitted(state.procedures[op], state.observations[op])))];
  return { ...parsed, missing, complete: missing.length === 0 };
}

function forecast(state, expression) {
  const checked = coverage(state, expression);
  if (!checked.complete) return { probability: 0, source: 'missing_definition', ...checked };
  const risks = [...new Set(checked.operators)].map(op => 1 / (new Set(state.observations[op].map(row => row.x)).size + 2));
  return { probability: Math.max(0, 1 - risks.reduce((sum, risk) => sum + risk, 0)),
    source: 'verified_support_laplace_union_bound', ...checked };
}

function execute(state, expression) {
  const prediction = forecast(state, expression);
  if (!prediction.complete) return { answer: null, confidence: 0, abstain: true,
    missing: prediction.missing, source: 'coverage_gate' };
  let value = prediction.input;
  for (const op of prediction.operators) {
    const rule = state.procedures[op].rule;
    value = rule.a * value + rule.b;
    if (!validInteger(value)) throw Error('Arithmetic budget exceeded');
  }
  return { answer: value, confidence: prediction.probability, abstain: false, missing: [], source: 'verified_procedure' };
}

module.exports = { chain, admitted, coverage, forecast, execute };
