'use strict';

const crypto = require('node:crypto');
const protocol = require('./protocol.json');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function random(seed) {
  let counter = 0;
  return max => parseInt(hash([seed, counter++]).slice(0, 12), 16) % max;
}

function worldFor(seed) {
  const next = random(seed);
  return Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
    'op_' + hash([seed, i]).slice(0, 8), { a: next(4) + 2, b: next(19) - 9 }
  ]));
}

function task(input) {
  const expression = input.operators.reduce((value, op) => ({ op, value }), input.x);
  return { id: hash(expression), family: input.family, expression };
}

function training(world) {
  const known = Object.keys(world).slice(0, 4);
  return Array.from({ length: protocol.trainingExperiences }, (_, i) => task({
    family: 'training', operators: [known[i % known.length]], x: Math.floor(i / 4) - 12
  }));
}

function heldout(world, seed) {
  const next = random(seed);
  const ops = Object.keys(world);
  const rows = [];
  const seen = new Set();
  for (const [family, count] of Object.entries(protocol.heldout)) {
    let added = 0;
    while (added < count) {
      const operators = operatorsFor(family, { next, ops });
      const row = task({ family, operators, x: next(900) + 100 });
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      added++;
    }
  }
  return shuffle(rows, next);
}

function operatorsFor(family, state) {
  const { next, ops } = state;
  if (family === 'new_input') return [ops[next(4)]];
  if (family === 'new_composition') return [ops[next(4)], ops[next(4)]];
  return next(2) ? [ops[4 + next(2)]] : [ops[next(4)], ops[4 + next(2)]];
}

function shuffle(values, next) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = next(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function operators(expression) {
  if (typeof expression === 'number') return [];
  return [expression.op, ...operators(expression.value)];
}

function generate(seeds) {
  const world = worldFor(seeds.world);
  const train = training(world);
  const test = heldout(world, seeds.test);
  const trainIds = new Set(train.map(row => row.id));
  if (test.some(row => trainIds.has(row.id))) throw Error('Training/holdout overlap');
  return { world, training: train, heldout: test };
}

module.exports = { hash, random, generate, operators, shuffle };
