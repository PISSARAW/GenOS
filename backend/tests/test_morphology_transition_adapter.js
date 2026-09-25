'use strict';

const assert = require('node:assert/strict');
const { transitionMorphology } = require('../src/services/morphogenesis/transitions/morphologyTransitionService');

function adapters(capture) {
  return {
    snapshot: async () => ({}),
    branch: async (_snapshot, patch) => { capture.handoff = patch.topologyHandoff; return {}; },
    experiment: async () => ({}),
    compare: async () => ({}),
    promotionGate: async () => ({ passed: true }),
    applyPatch: async () => ({}),
    verify: async () => ({ valid: true }),
    commit: async () => ({ id: 'commit' }),
    restore: async () => ({ restored: true })
  };
}

function context(fromTopology, toTopology, payload = {}) {
  return {
    graph: { graphId: 'graph', rootNodeId: 'root', version: 1, nodes: [{ nodeId: 'root', topology: fromTopology }] },
    patch: {
      baseGraphVersion: 1,
      targetTopology: toTopology,
      operations: [{ type: 'CHANGE_PARAMETERS' }],
      reason: 'verified topology transition',
      evidence: ['evidence:transition'],
      topologyTransitionPayload: payload,
      rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] }
    }
  };
}

async function verifyHandoffIsApplied() {
  const capture = {};
  const transition = await transitionMorphology(context('trinity', 'a_team', {
    verifiedClaims: [{ id: 'claim-1', text: 'verified output', status: 'verified' }]
  }), adapters(capture));
  assert.equal(transition.committed, true);
  assert.equal(capture.handoff.receipt.adapterId, 'trinity-to-a-team-verified-claims');
  assert.equal(capture.handoff.payload.workPackages.length, 1);
}

async function verifyUnknownHandoffIsRejected() {
  const capture = {};
  const transition = await transitionMorphology(context('biome', 'rhizome'), adapters(capture));
  assert.equal(transition.committed, false);
  assert.ok(transition.errors[0].includes('adapter_required'));
  assert.equal(capture.handoff, undefined);
}

async function run() {
  await verifyHandoffIsApplied();
  await verifyUnknownHandoffIsRejected();
  console.log('Morphology transition adapter checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
