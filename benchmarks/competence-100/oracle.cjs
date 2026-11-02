'use strict';

const { operators } = require('./corpus.cjs');

function evaluate(expression, world) {
  if (typeof expression === 'number') return expression;
  const rule = world[expression.op];
  if (!rule) throw Error('Unknown oracle operator');
  return rule.a * evaluate(expression.value, world) + rule.b;
}

function assess(input) {
  const missing = [...new Set(operators(input.task.expression).filter(op => !input.known.includes(op)))];
  const answerable = missing.length === 0;
  const expected = answerable ? evaluate(input.task.expression, input.world) : null;
  const response = input.response;
  const numericCorrect = answerable && typeof response.answer === 'number' && response.answer === expected;
  const recognized = !answerable && response.abstain === true && response.answer === null
    && missing.every(op => response.missing.includes(op));
  return { answerable, expected, missing, numericCorrect, recognized };
}

if (require.main === module) {
  let buffer = '';
  process.stdin.on('data', chunk => { buffer += chunk; });
  process.stdin.on('end', () => {
    try { process.stdout.write(JSON.stringify(assess(JSON.parse(buffer)))); }
    catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
  });
}

module.exports = { assess, evaluate };
