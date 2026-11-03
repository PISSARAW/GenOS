'use strict';
const validation = require('./learningRuleValidation');

function nodes(expression) {
  const result = [];
  let cursor = expression;
  while (cursor && typeof cursor === 'object') {
    if (result.length >= 16 || typeof cursor.op !== 'string') throw new Error('LEARNING_PLAN_EXPRESSION_INVALID');
    result.unshift(cursor);
    cursor = cursor.input;
  }
  if (!result.length) throw new Error('LEARNING_PLAN_EXPRESSION_INVALID');
  if (typeof cursor === 'string' && cursor.length <= 4096) return result;
  if (Number.isSafeInteger(cursor)) return result;
  throw new Error('LEARNING_PLAN_INPUT_INVALID');
}

function describe(lessons, expression) {
  const ordered = nodes(expression);
  const steps = ordered.map((node, index) => {
    const rule = Object.hasOwn(lessons, node.op) ? lessons[node.op] : null;
    if (rule && !validation.validRule(rule)) throw new Error('LEARNING_PLAN_RULE_INVALID');
    return { operator: node.op, rule, input: index === 0 ? node.input : { step: index - 1 } };
  });
  return { literal: { value: ordered[0].input, characters: Array.from(String(ordered[0].input)) },
    steps, expression: symbolic(steps, ordered[0].input),
    unknownOperators: [...new Set(steps.filter(step => !step.rule).map(step => step.operator))] };
}

function symbolic(steps, input) {
  let result = typeof input === 'string' ? `join(${JSON.stringify(Array.from(input))})` : JSON.stringify(input);
  for (const step of steps) {
    result = result === null || !step.rule ? null : compileStep(step.rule, result);
  }
  return result;
}

function compileStep(rule, input) {
  if (rule.kind === 'affine') return `((${rule.a}) * (${input}) + (${rule.b}))`;
  let body = input;
  if (rule.reverse) body = `reverse(${body})`;
  if (rule.upper) body = `upper(${body})`;
  return `concat(${JSON.stringify(rule.prefix)}, ${body}, ${JSON.stringify(rule.suffix)})`;
}

module.exports = { describe };
