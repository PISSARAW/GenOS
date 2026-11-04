'use strict';

const fs = require('node:fs');
const corpus = require('./corpus.cjs');
const HYPOTHESES = corpus.candidates();

function fits(history) {
  return HYPOTHESES.filter(rule => history.every(row => corpus.value(rule, row.x) === row.y));
}

function outputs(expression, domains) {
  if (typeof expression === 'number') return new Set([expression]);
  const inner = outputs(expression.value, domains);
  const result = new Set();
  for (const rule of domains[expression.op]) {
    for (const x of inner) result.add(corpus.value(rule, x));
  }
  return result;
}

function truth(expression, input) {
  if (typeof expression === 'number') return expression;
  const index = input.world.operators.indexOf(expression.op);
  const rule = input.query.epochs[expression.op] ? input.world.changed : input.world.rules[index];
  return corpus.value(rule, truth(expression.value, input));
}

function assess(input) {
  const relevant = corpus.relevant(input.history, input.query);
  const ops = corpus.operators(input.query.expression);
  const domains = Object.fromEntries(ops.map(op => [op, fits(relevant.filter(row => row.op === op))]));
  if (Object.values(domains).some(rows => rows.length === 0)) throw Error('True world outside public hypothesis class');
  const values = outputs(input.query.expression, domains);
  const missing = ops.filter(op => !relevant.some(row => row.op === op));
  return { expected: truth(input.query.expression, input), identifiable: values.size === 1,
    alternatives: values.size, missing: [...new Set(missing)],
    reason: values.size === 1 ? 'answerable' : (missing.length ? 'missing' : 'ambiguous') };
}

if (require.main === module) {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  process.stdout.write(JSON.stringify(input.queries.map(query => assess({ ...input, query }))));
}
module.exports = { fits, outputs, assess };
