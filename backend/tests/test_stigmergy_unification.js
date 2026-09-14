const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');

(async () => {
  const session = await rhizome.composeRhizome('Grow a decentralized capability mesh with a shared stigmergic medium.');
  await rhizome.depositTrail(session.sessionId, 'edge:e1', { amount: 3 });

  const step = await rhizome.runSlimeMouldStep(session.sessionId, [
    { id: 'e1', flow: 2 },
    { id: 'e2', flow: 0 }
  ]);
  assert.equal(step.edges.length, 1);
  assert.equal(step.edges[0].id, 'e1');
  assert.ok(step.edges[0].conductivity >= 2);
  assert.equal(session.matrix.getDecayedIntensity('edge:e1') > 0, true);
  assert.equal(session.matrix.getDecayedIntensity('edge:e2'), 0);

  assert.equal(await rhizome.closeSession(session.sessionId), true);
  console.log('Stigmergy unification checks: PASS');
})().catch((error) => {
  console.error('Stigmergy unification test failed:', error);
  process.exit(1);
});
