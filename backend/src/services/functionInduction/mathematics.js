'use strict';

const KINDS = new Set(['affine', 'quadratic', 'hinge']);
const SIGNATURE_INPUTS = [-2, -1, 0, 1, 2, 7, 8];

function value(rule, x) {
  if (rule.kind === 'quadratic') return (rule.a * x + rule.b) * x + rule.c;
  if (rule.kind === 'hinge') return rule.a * x + rule.b + rule.c * Math.max(0, x - 5);
  return rule.a * x + rule.b;
}

function programValid(rule) {
  if (!rule || !KINDS.has(rule.kind)) return false;
  if (!['a', 'b', 'c'].every(key => Number.isInteger(rule[key]) && Math.abs(rule[key]) <= 3)) return false;
  return rule.kind !== 'affine' || rule.c === 0;
}

function candidates() {
  const result = [];
  for (let a = -3; a <= 3; a++) {
    for (let b = -3; b <= 3; b++) {
      result.push({kind: 'affine', a, b, c: 0});
      for (let c = -3; c <= 3; c++) {
        result.push({kind: 'quadratic', a, b, c}, {kind: 'hinge', a, b, c});
      }
    }
  }
  return result;
}

function sampleValue(rule, x) {
  const affine = rule.a * x + rule.b;
  if (rule.kind === 'affine') return affine;
  if (rule.kind === 'quadratic') return rule.a * x ** 2 + rule.b * x + rule.c;
  return affine + (x > 5 ? rule.c * (x - 5) : 0);
}

function matches(rule, samples) {
  return samples.length > 0 && samples.every(row => sampleValue(rule, row.x) === row.y);
}

function identifiability(samples) {
  if (!samples.length) return 'missing';
  const matching = candidates().filter(rule => samples.every(row => value(rule, row.x) === row.y));
  const signatures = new Set(matching.map(rule => JSON.stringify(SIGNATURE_INPUTS.map(x => value(rule, x)))));
  if (!signatures.size) return 'inconsistent';
  return signatures.size === 1 ? 'answerable' : 'ambiguous';
}

module.exports = {value, programValid, candidates, matches, identifiability};
