'use strict';

const assert = require('node:assert/strict');
const runner = require('./run_topology_contracts.cjs');

const expected = [
  'trinity', 'a_team', 'biome', 'biocenose',
  'rhizome', 'syncytium', 'holobionte', 'metapopulation'
];

assert.deepEqual(runner.topologyChecks.map((item) => item.id), expected);
assert.equal(new Set(runner.topologyChecks.map((item) => item.id)).size, 8);
assert.ok(runner.topologyChecks.every((item) => item.scripts.length > 0));
assert.deepEqual(runner.selectedTopologies(['--topology=syncytium']).map((item) => item.id),
  ['syncytium']);
assert.throws(() => runner.selectedTopologies(['--topology=unknown']), /Unknown topology/);

const boundaries = new Set(runner.boundaryChecks.map((item) => item.id));
for (const required of ['worker_wait', 'variant_fallback', 'biological_receipts',
  'morphogenesis_commit', 'llm_stdio']) {
  assert.ok(boundaries.has(required), `missing boundary check: ${required}`);
}

console.log('Topology contract catalog: eight topologies and production boundaries are explicit.');
