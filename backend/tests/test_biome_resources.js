'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const { createNiche } = require('../src/services/biome/contracts/niche');

async function run() {
  const niche = createNiche({ nicheId: 'resource-test', resourceProfile: {
    tokens: { minimum: 2, preferred: 5, maximum: 10 }
  } });
  assert.deepEqual(niche.resourceProfile.tokens, { minimum: 2, preferred: 5, maximum: 10 });
  assert.throws(() => createNiche({ nicheId: 'invalid', resourceProfile: {
    tokens: { minimum: 6, preferred: 5, maximum: 10 }
  } }), { code: 'BIOME_CONTRACT_INVALID' });

  const session = await biome.composeBiome('Analyze logs and query data.', {
    environment: { opportunities: [
      { id: 'logs', descriptor: 'Analyze logs', opportunityScore: 0.8, evidenceRefs: ['artifact:logs'], resourceProfile: { tokens: { minimum: 2, preferred: 5, maximum: 10 } } },
      { id: 'sql', descriptor: 'Query data', opportunityScore: 0.7, evidenceRefs: ['artifact:data'], resourceProfile: { tokens: { minimum: 1, preferred: 3, maximum: 6 } } }
    ] }
  });
  await biome.discoverSessionNiches(session.sessionId);
  await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-logs' });
  await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-sql' });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: { type: 'create', population: { populationId: 'logs-team', nicheId: 'niche-logs' } } });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: { type: 'create', population: { populationId: 'sql-team', nicheId: 'niche-sql' } } });

  const allocation = await biome.manageSessionResources({ sessionId: session.sessionId, command: {
    type: 'resource_allocate', resources: { tokens: 12 },
    reserveRatios: { recovery: 0.1, verification: 0.1, exploration: 0.1 }
  } });
  assert.equal(allocation.allocations['logs-team'].tokens, 5);
  assert.equal(allocation.allocations['sql-team'].tokens, 3);
  assert.ok(Math.abs(allocation.reserve.tokens - 3.6) < 1e-9);
  assert.equal(allocation.carryingCapacity.find((item) => item.populationId === 'logs-team').capacity, 2);

  const consumed = await biome.manageSessionResources({ sessionId: session.sessionId, command: {
    type: 'resource_consume', populationId: 'logs-team', resources: { tokens: 2 }, purpose: 'inspect logs'
  } });
  assert.equal(consumed.population.resourcePool.tokens, 3);
  assert.equal(consumed.pressure.level, 'constrained');
  await assert.rejects(() => biome.manageSessionResources({ sessionId: session.sessionId, command: {
    type: 'resource_consume', populationId: 'logs-team', resources: { tokens: 4 }
  } }), { code: 'BIOME_RESOURCE_INSUFFICIENT' });

  const released = await biome.manageSessionResources({ sessionId: session.sessionId, command: { type: 'resource_release_reserve' } });
  assert.ok(Math.abs(released.resourcePool.tokens - 1.6) < 1e-9);
  const snapshot = await biome.sessionSnapshot(session.sessionId);
  assert.equal(snapshot.ecologicalState.recoveryReserve.tokens, 0);
  assert.ok(Math.abs(snapshot.ecologicalState.verificationReserve.tokens - 1.2) < 1e-9);
  assert.ok(Math.abs(snapshot.ecologicalState.explorationReserve.tokens - 1.2) < 1e-9);
  assert.equal(snapshot.ecologicalState.resourceTransactions.length, 1);
  console.log('Biome resource checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
