'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const distance = require('../src/services/biome/foraging/semanticDistanceService');
const selector = require('../src/services/biome/foraging/patchSelector');

async function run() {
  assert.equal(distance.semanticDistance('inspect runtime logs', 'inspect runtime logs'), 0);
  assert.equal(distance.semanticDistance('runtime logs', 'SQL tables'), 1);
  assert.equal(selector.selectAlternative({ currentPatchId: 'old', alternatives: [
    { patchId: 'full', expectedReturn: 10, occupancy: 4, parallelCapacity: 4 }
  ] }), null);

  const session = await biome.composeBiome('Analyze logs and records.', {
    environment: { opportunities: [{ id: 'logs', descriptor: 'Analyze logs', opportunityScore: 0.8,
      evidenceRefs: ['artifact:logs'], requiredCapabilities: ['log-analysis'] }] }
  });
  await biome.discoverSessionNiches(session.sessionId);
  await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-logs' });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'create', population: { populationId: 'log-team', nicheId: 'niche-logs', patchId: 'old-patch',
      resourcePool: { tokens: 5 }, individuals: [{ individualId: 'worker-a', capabilities: ['log-analysis'], patchId: 'old-patch' }] }
  } });

  const departure = await biome.forageSession(session.sessionId, [{ infoGain: 0.1 }], {
    currentPatchId: 'old-patch', currentDescriptor: 'runtime logs', currentMarginalReturn: 0.1,
    populationId: 'log-team', migrationCost: { tokens: 2 }, elapsedTimeSec: 1,
    alternativePatches: [{ patchId: 'data-patch', descriptor: 'SQL data tables', expectedReturn: 0.2,
      expectedInformationGain: 0.3, uncertainty: 0.1, risk: 0.1, occupancy: 0, parallelCapacity: 3,
      switchCost: 0.05, operation: 'query the relevant data rows' }]
  });
  assert.equal(departure.decision, 'PATCH_DEPARTURE');
  assert.equal(departure.action.status, 'applied');
  assert.equal(departure.migration.consumed.tokens, 2);
  assert.equal(departure.migration.population.patchId, 'data-patch');
  assert.equal(departure.migration.population.resourcePool.tokens, 3);
  assert.equal(departure.execution.type, 'EXECUTE_PATCH');
  assert.equal(departure.execution.status, 'requested');

  const stay = await biome.forageSession(session.sessionId, [{ infoGain: 2 }], {
    currentPatchId: 'data-patch', currentMarginalReturn: 5,
    alternativePatches: [{ patchId: 'other', expectedReturn: 0.1, switchCost: 1 }]
  });
  assert.equal(stay.decision, 'STAY_ON_PATCH');
  assert.equal(stay.action.type, 'CONTINUE_FORAGING');
  const snapshot = await biome.sessionSnapshot(session.sessionId);
  assert.equal(snapshot.ecologicalState.patchExecutions.length, 1);
  assert.equal(snapshot.ecologicalState.patchMigrations.length, 1);
  assert.equal(snapshot.ecologicalState.patchOccupancy['data-patch'], 1);
  console.log('Biome foraging checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
