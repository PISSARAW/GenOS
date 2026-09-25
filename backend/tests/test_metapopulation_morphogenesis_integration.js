'use strict';

const assert = require('node:assert/strict');
const metapopulation = require('../src/services/metapopulationCoordinationService');

function transitionAdapters(regionalValid) {
  return {
    snapshot: async () => ({ id: 'snapshot-1' }),
    branch: async () => ({ id: 'branch-1' }),
    experiment: async () => ({ id: 'experiment-1' }),
    compare: async () => ({ gain: 0.2 }),
    promotionGate: async () => ({ passed: true }),
    applyPatch: async () => ({ id: 'applied-1' }),
    verify: async () => ({ valid: true }),
    verifyRegionalInvariant: async () => ({ valid: regionalValid, topology: regionalValid ? 'metapopulation' : 'a_team' }),
    commit: async () => ({ id: 'commit-1' }),
    restore: async () => ({ restored: true })
  };
}

function transitionInput() {
  const plan = { transitionRequested: true, currentTopology: 'trinity', proposedTopology: 'a_team' };
  return { demeId: 'deme-a', plan, context: {
    graph: { scope: 'deme', demeId: 'deme-a', topology: 'trinity', version: 1 },
    regionalTopology: 'metapopulation',
    patch: { demeId: 'deme-a', targetTopology: 'a_team', baseGraphVersion: 1,
      operations: [{ type: 'CHANGE_PARAMETERS' }], reason: 'local failure pressure', evidence: [{ verified: true }],
      topologyTransitionPayload: { verifiedClaims: [{ id: 'claim-1', text: 'local result', status: 'verified' }] },
      rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] } }
  } };
}

async function main() {
  const plan = metapopulation.planNestedTopologies({ demes: [
    { demeId: 'deme-a', localTopology: 'a_team', localFitness: 0.2, failureRate: 0.7,
      localDiversity: 0.8, localIndependence: 0.8, domain: 'security' }
  ] });
  assert.equal(plan.regionalTopology, 'metapopulation');
  assert.equal(plan.demes.length, 1);
  assert.notEqual(plan.demes[0].proposedTopology, 'metapopulation');
  assert.equal(plan.demes[0].transitionRequested, true);

  const committed = await metapopulation.executeNestedTransition({ ...transitionInput(), adapters: transitionAdapters(true) });
  assert.equal(committed.committed, true);
  assert.equal(committed.regionalTopologyUnchanged, true);

  const rejected = await metapopulation.executeNestedTransition({ ...transitionInput(), adapters: transitionAdapters(false) });
  assert.equal(rejected.committed, false);
  assert.equal(rejected.rolledBack, true);

  const unscoped = transitionInput();
  unscoped.context.graph.scope = 'regional';
  const blocked = await metapopulation.executeNestedTransition({ ...unscoped, adapters: transitionAdapters(true) });
  assert.equal(blocked.committed, false);
  assert.equal(blocked.regionalTopologyUnchanged, false);
  console.log('Metapopulation/Morphogenesis integration checks: PASS');
}

main().catch((error) => { console.error(error); process.exit(1); });
