const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');

(async () => {
  const session = await rhizome.composeRhizome('Grow a decentralized capability network without a permanent central authority.');
  assert.equal(session.members.length, 4);
  assert.equal(session.organization, 'mycelial_routing');
  assert.ok(session.capabilityContract.required.includes('LIGAND_RECEPTOR'));
  assert.ok(session.capabilityContract.required.includes('STIGMERGY'));
  assert.ok(session.capabilityContract.required.includes('STRATEGY_ADAPTATION'));
  const graph = await rhizome.graphSnapshot(session.sessionId);
  assert.equal(graph.contract, 'RhizomeGraphSnapshot/v1');
  assert.equal(graph.graphVersion, 0);

  const positive = await rhizome.depositTrail(session.sessionId, 'route:capability/gap', { amount: 5 });
  assert.equal(positive.trail.intensity, 5);
  assert.equal(positive.dominant.dominantPath, 'route:capability/gap');

  await rhizome.depositTrail(session.sessionId, 'route:capability/gap', { amount: 8, isRepellent: true });
  const dominated = await rhizome.depositTrail(session.sessionId, 'route:other', { amount: 7 });
  assert.equal(dominated.dominant.dominantPath, 'route:other');

  const selected = await rhizome.routeDirectMember(session.sessionId, 'boundary_scout');
  assert.equal(selected.selected, true);
  assert.equal(selected.memberRole, 'boundary_scout');
  assert.equal((await rhizome.routeDirectMember(session.sessionId, 'missing_skill')).selected, false);

  const coherence = await rhizome.coherence(session.sessionId);
  assert.ok(typeof coherence.orderParameter === 'number');

  assert.equal(await rhizome.closeSession(session.sessionId), true);
  await assert.rejects(() => rhizome.coherence(session.sessionId), (error) => error.code === 'RHIZOME_SESSION_UNKNOWN');
  console.log('Rhizome wiring checks: PASS');
})().catch((error) => {
  console.error('Rhizome wiring test failed:', error);
  process.exit(1);
});
