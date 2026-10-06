'use strict';

const { isDeepStrictEqual } = require('node:util');

const PREDICATES = Object.freeze({
  present: (value) => typeof value === 'string' && value.trim().length > 0,
  recorded: (value) => Array.isArray(value) && value.length > 0,
  explicit: (value) => value === true,
  equal: (value) => Array.isArray(value) && value.length === 2 && isDeepStrictEqual(value[0], value[1]),
  different: (value) => Array.isArray(value) && value.length === 2 && !isDeepStrictEqual(value[0], value[1]),
  positive: (value) => Number.isFinite(value) && value > 0,
  zero: (value) => Number.isFinite(value) && value === 0,
  probability: (value) => Number.isFinite(value) && value >= 0 && value <= 1,
  multiple: (value) => Array.isArray(value) && value.some((item) => !isDeepStrictEqual(item, value[0])),
  ordered: (value) => Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite)
    && value.slice(1).every((item, index) => item >= value[index]),
});

// These are boundary probes of the declared operational interpretation, not
// empirical evidence for a philosophical theory or a mission's source facts.
const EXAMPLES = Object.freeze({
  present: ['source:fixture', ''], recorded: [['event:1'], []], explicit: [true, false],
  equal: [[{ value: 1 }, { value: 1 }], [{ value: 1 }, { value: 2 }]],
  different: [[1, 2], [1, 1]], positive: [2, 0], zero: [0, 1],
  probability: [0.7, 1.1], multiple: [['agent:a', 'agent:b'], ['agent:a', 'agent:a']],
  ordered: [[1, 2, 3], [1, 3, 2]],
});

function evaluatePredicate(name, value) {
  const predicate = PREDICATES[name];
  if (!predicate) throw new Error(`unknown operational predicate: ${name}`);
  if (value === undefined) return { status: 'unobserved', satisfied: false };
  const satisfied = predicate(value);
  return { status: satisfied ? 'satisfied' : 'violated', satisfied };
}

function probeValues(name) {
  if (!EXAMPLES[name]) throw new Error(`unknown operational predicate: ${name}`);
  return structuredClone(EXAMPLES[name]);
}

module.exports = { evaluatePredicate, probeValues, predicateNames: Object.keys(PREDICATES) };
