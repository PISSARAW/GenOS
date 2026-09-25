'use strict';

const assert = require('node:assert/strict');
const { evaluateMissionResult } = require('../src/services/topologyMissionEvaluationService');

const input = {
  fixtureId: 'level-1',
  method: 'gloutonne',
  answer: 'Machine 1 -> E (6), B (3), A (2). Machine 2 -> D (5), C (4). Makespan = 11.'
};
const topologies = ['trinity', 'biome', 'syncytium', 'rhizome', 'metapopulation'];
const results = topologies.map((topology) => evaluateMissionResult({ ...input, topology }));

assert.ok(results.every((result) => result.evaluation.valid));
assert.ok(results.every((result) => result.evaluation.fitnessValue === results[0].evaluation.fitnessValue));
assert.equal(results.find((result) => result.topology === 'metapopulation').migrationPolicy, 'receiver-local-validation');
assert.ok(results.filter((result) => result.topology !== 'metapopulation')
  .every((result) => result.migrationPolicy === 'not-applicable'));
assert.throws(() => evaluateMissionResult({ ...input, topology: 'unknown-mode' }), { code: 'TOPOLOGY_UNKNOWN' });

console.log('Topology comparative evaluation: PASS');
