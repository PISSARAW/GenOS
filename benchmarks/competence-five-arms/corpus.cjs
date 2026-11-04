'use strict';

const crypto = require('node:crypto');
const protocol = require('./protocol.json');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function random(seed) {
  let counter = 0;
  return max => parseInt(hash([seed, counter++]).slice(0, 12), 16) % max;
}

function value(rule, x) {
  if (rule.kind === 'quadratic') return rule.a * x * x + rule.b * x + rule.c;
  if (rule.kind === 'hinge') return rule.a * x + rule.b + rule.c * Math.max(0, x - 5);
  return rule.a * x + rule.b;
}

function candidates() {
  const result = [];
  const bound = protocol.coefficientBound;
  for (let a = -bound; a <= bound; a++) {
    for (let b = -bound; b <= bound; b++) {
      result.push({ kind: 'affine', a, b });
      for (let c = -bound; c <= bound; c++) {
        result.push({ kind: 'quadratic', a, b, c }, { kind: 'hinge', a, b, c });
      }
    }
  }
  return result;
}

function world(seed) {
  const next = random(seed);
  const operators = Array.from({ length: 6 }, (_, i) => 'op_' + hash([seed, i]).slice(0, 8));
  const affine = () => ({ kind: 'affine', a: 1 + next(3), b: next(7) - 3 });
  const rules = [affine(), { ...affine(), kind: 'hinge', c: 1 + next(2) },
    { kind: 'quadratic', a: 1 + next(2), b: next(5) - 2, c: next(7) - 3 }, affine(), affine(), affine()];
  const changed = { ...rules[3], b: rules[3].b === 3 ? -3 : rules[3].b + 1 };
  return { seed, operators, rules, changed };
}

function observations(input) {
  const xs = [-2, -1, 0, 1, 2, 7];
  return Array.from({ length: 100 }, (_, index) => {
    const slot = index >= 96 ? 4 : index % 4;
    const epoch = slot === 3 && index >= 60 ? 1 : 0;
    const x = slot === 4 ? 0 : xs[Math.floor(index / 4) % xs.length];
    const rule = epoch ? input.changed : input.rules[slot];
    return { step: index + 1, runId: hash([input.seed, index]).slice(0, 16),
      op: input.operators[slot], epoch, x, y: value(rule, x) };
  });
}

function expression(ops, x) {
  return ops.reduce((node, op) => ({ op, value: node }), x);
}

function queries(input, checkpoint) {
  const next = random(input.seed + ':tests');
  const inputs = Array.from({ length: 100 }, (_, i) => 100 + i);
  for (let i = inputs.length - 1; i > 0; i--) {
    const j = next(i + 1);
    [inputs[i], inputs[j]] = [inputs[j], inputs[i]];
  }
  const offset = protocol.checkpoints.indexOf(checkpoint) * 12;
  const ops = input.operators;
  const specs = [
    ...ops.slice(0, 4).map(op => ({ family: 'new_input', ops: [op] })),
    ...[[0, 1], [1, 2], [2, 3], [3, 0]].map(pair => ({ family: 'composition', ops: pair.map(i => ops[i]) })),
    { family: 'ambiguity', ops: [ops[4]] }, { family: 'ambiguity', ops: [ops[4], ops[0]] },
    { family: 'missing', ops: [ops[5]] }, { family: 'missing', ops: [ops[5], ops[0]] }
  ];
  return specs.map((spec, i) => {
    const query = { expression: expression(spec.ops, inputs[offset + i]),
      epochs: { [ops[3]]: checkpoint >= 61 ? 1 : 0 }, family: spec.family };
    return { ...query, id: hash(query) };
  });
}

function operators(node) {
  return typeof node === 'number' ? [] : [node.op, ...operators(node.value)];
}

function relevant(history, query) {
  const wanted = new Set(operators(query.expression));
  return history.filter(row => wanted.has(row.op) && row.epoch === (query.epochs[row.op] || 0));
}

module.exports = { hash, random, value, candidates, world, observations, queries, expression, operators, relevant };
