'use strict';

const assert = require('node:assert/strict');
const variantWorkers = require('../src/services/syncytiumVariantWorkerService');
const topologyWorkerKinds = require('../src/services/topologyWorkerKindService');

const EXPECTED_ROLES = {
  code: 'code_semantic_reviewer',
  graph: 'graph_analyzer',
  document: 'causal_reconstructor',
  epistemic: 'epistemic_specialist',
  transactional: 'transactional_validator'
};

for (const [variantId, role] of Object.entries(EXPECTED_ROLES)) {
  const members = variantWorkers.membersForSession({
    mission: `Validate ${variantId} session`, variantPolicy: { id: variantId }
  });
  assert.equal(members.length, 1, `${variantId} specialist count`);
  assert.equal(members[0].role, role, `${variantId} specialist role`);
  assert.equal(members[0].variantId, variantId, `${variantId} specialist identity`);
  assert.match(members[0].mission, new RegExp(`Variant specialist \\(${variantId}\\)`));
  const resolved = topologyWorkerKinds.applyTopologyWorkerKinds('syncytium', { members });
  assert.equal(resolved.members[0].executionMode, 'worker', `${variantId} worker execution`);
  assert.ok(resolved.members[0].workerKind, `${variantId} WorkerKind`);
}

assert.deepEqual(variantWorkers.membersForSession({ variantPolicy: { id: 'hard' } }), []);
console.log('Syncytium variant worker checks: PASS');
