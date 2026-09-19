'use strict';

const assert = require('assert');
const consciousness = require('../src/services/consciousnessService');
const router = require('../src/services/philosophyRouter');

async function main() {
  const qualia = consciousness.recordQualia({ agentId: 'agent', experience: 'uncertainty', intensity: 5 });
  assert.equal(qualia.intensity, 1);
  assert.equal(qualia.reportBasis, 'agent_supplied_label');
  assert.equal(qualia.phenomenalAccess, 'unassessed');
  assert.equal(qualia.whatItIsLike, undefined);

  const intent = consciousness.recordIntentionality({ agentId: 'agent', target: 'mission' });
  assert.equal(intent.subjectiveAwareness, 'unassessed');

  const inconclusive = consciousness.checkSupervenience({ mentalState: { plan: 1 }, physicalState: { cpu: 1 } });
  assert.equal(inconclusive.status, 'insufficient_comparison');
  const compatible = consciousness.checkSupervenience({
    physicalStateA: { cpu: 1, cache: { a: 2, b: 3 } }, physicalStateB: { cache: { b: 3, a: 2 }, cpu: 1 },
    mentalStateA: { plan: 1 }, mentalStateB: { plan: 1 }
  });
  assert.equal(compatible.supervenes, true);
  assert.equal(compatible.candidateOnly, true);
  const counterexample = consciousness.checkSupervenience({
    physicalStateA: { cpu: 1 }, physicalStateB: { cpu: 1 },
    mentalStateA: { plan: 1 }, mentalStateB: { plan: 2 }
  });
  assert.equal(counterexample.status, 'counterexample_observed');

  const coupling = consciousness.mindBodyInteraction({ agentId: 'agent', body: 'workspace', interaction: 'cartesian' });
  assert.equal(coupling.dualist, true);
  assert.equal(coupling.metaphysicalClaimEstablished, false);
  assert.equal(consciousness.hashState({ a: { x: 1, y: 2 } }), consciousness.hashState({ a: { y: 2, x: 1 } }));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => consciousness.hashState(cyclic), /circular/);

  const routes = [
    ['metaphysics.qualia', { agentId: 'agent', experience: 'uncertainty' }],
    ['metaphysics.reference-intentionality', { agentId: 'agent', target: 'mission' }],
    ['metaphysics.supervenience', { mentalState: {}, physicalState: {} }],
    ['metaphysics.mind-body', { agentId: 'agent', body: 'workspace' }],
    ['metaphysics.emergence', { agentId: 'system', systemPropertyKey: 'coordination', constituentIds: ['a'] }]
  ];
  for (const [concept, args] of routes) {
    const result = await router.handlePhilosophyRequest({ request: { operation: 'evaluateConcept', arguments: { concept, ...args } } });
    assert.equal(result.supported, true, `${concept} route`);
  }
  console.log('Bounded philosophical adapter tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
