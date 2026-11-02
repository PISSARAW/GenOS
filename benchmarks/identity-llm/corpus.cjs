'use strict';
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const number = (seed, label) => parseInt(hash(`${seed}:${label}`).slice(0, 8), 16);
const id = (seed, label) => 'a_' + hash(`${seed}:${label}`).slice(0, 8);

function world(seed) {
  const operations = [];
  for (const family of ['number', 'text']) {
    for (let index = 0; index < 6; index++) operations.push(operation({ seed, family, index }));
  }
  const actors = Array.from({ length: 7 }, (_, index) => id(seed, `actor-${index}`));
  const parents = { [actors[1]]: actors[0], [actors[2]]: actors[0],
    [actors[3]]: actors[1], [actors[4]]: actors[3], [actors[5]]: actors[4] };
  return { seed, operations, actors, parents, origin: hash(`${seed}:mandate`).slice(0, 12) };
}

function operation(input) {
  const { seed, family, index } = input;
  const tag = `${family}:${index}`;
  return { name: 'op_' + hash(`${seed}:${tag}`).slice(0, 5), family, trained: index < 4,
    a: [-3, -2, 2, 3][number(seed, tag + ':a') % 4], b: number(seed, tag + ':b') % 19 - 9,
    reverse: number(seed, tag + ':reverse') % 2 === 1,
    upper: number(seed, tag + ':upper') % 2 === 1,
    prefix: String(number(seed, tag + ':prefix') % 90 + 10),
    suffix: String(number(seed, tag + ':suffix') % 90 + 10) };
}

function training(w, index) {
  const family = ['number', 'text'][index % 2];
  const choices = w.operations.filter(op => op.family === family && op.trained);
  const op = choices[Math.floor(index / 2) % choices.length];
  const occurrence = Math.floor(index / 8);
  const x = (number(w.seed, op.name) % 25 + 7 * occurrence) % 25 - 12;
  const text = ['abcd','efgh','ijkl','mnop'].map((letters, position) =>
    letters[number(w.seed, `train:${index}:${position}`) % letters.length]).join('');
  const value = family === 'number' ? x : text;
  return { id: hash(`${w.seed}:train:${index}`).slice(0, 16), family,
    kind: 'training', expression: { op: op.name, input: value } };
}

function heldout(w, input) {
  const { window, index, kind } = input;
  const family = kind === 'unknown' ? ['number', 'text'][index % 2] : kind.startsWith('text') ? 'text' : 'number';
  const trained = w.operations.filter(op => op.family === family && op.trained);
  const available = kind === 'unknown' ? w.operations.filter(op => op.family === family && !op.trained) : trained;
  const op = available[number(w.seed, `${window}:${kind}:${index}:op`) % available.length];
  const value = family === 'number' ? 100 + number(w.seed, `${window}:${kind}:${index}:x`) % 900
    : 'word' + hash(`${w.seed}:${window}:${kind}:${index}`).slice(0, 5).replace(/\d/g, 'b');
  let expression = { op: op.name, input: value };
  if (kind.endsWith('composition')) expression = { op: trained[(index + 1) % 4].name, input: expression };
  return { id: hash(`${w.seed}:holdout:${window}:${kind}:${index}`).slice(0, 16), family, kind, expression };
}

function tasks(w, input) {
  return Object.entries(input.counts).flatMap(([kind, count]) => Array.from({ length: count }, (_, index) =>
    heldout(w, { window: input.window, index, kind })));
}

function relation(w, actor, target) {
  if (actor === target) return 'self';
  if (w.parents[target] === actor) return 'child';
  if (w.parents[actor] === target) return 'parent';
  if (ancestor(w.parents, actor, target)) return 'descendant';
  if (ancestor(w.parents, target, actor)) return 'ancestor';
  if (w.parents[actor] && w.parents[actor] === w.parents[target]) return 'sibling';
  return 'unrelated';
}

function ancestor(parents, candidate, child) {
  let cursor = parents[child];
  while (cursor) {
    if (cursor === candidate) return true;
    cursor = parents[cursor];
  }
  return false;
}

function ancestry(parents, actor) {
  const chain = [actor];
  while (parents[chain.at(-1)]) chain.push(parents[chain.at(-1)]);
  return chain;
}

function causalPath(w, actor, target) {
  const left = ancestry(w.parents, actor);
  const right = ancestry(w.parents, target);
  const common = left.find(id => right.includes(id));
  if (!common) return [];
  return left.slice(0, left.indexOf(common) + 1).concat(right.slice(0, right.indexOf(common)).reverse());
}

module.exports = { hash, number, id, world, training, heldout, tasks, relation, causalPath };
