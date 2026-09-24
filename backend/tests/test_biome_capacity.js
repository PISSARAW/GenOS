'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const pressure = require('../src/services/biome/resources/nichePressureService');

async function run() {
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
  await biome.manageSessionResources({ sessionId: session.sessionId, command: {
    type: 'resource_allocate', resources: { tokens: 16 }, reserveRatio: 0
  } });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'spawn', populationId: 'logs-team', individuals: [
      { individualId: 'log-a', capabilities: ['log-analysis'] },
      { individualId: 'log-b', capabilities: ['log-analysis'] }
    ]
  } });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'spawn', populationId: 'sql-team', individuals: [{ individualId: 'sql-a', capabilities: ['sql'] }]
  } });

  const measured = await biome.assessSessionCapacity({ sessionId: session.sessionId, garageCapacity: 1,
    measurements: { 'niche-logs': { coordinationCost: 0.5, contention: 0 } },
    thresholds: { recruitBelow: 0.4, throttleAt: 0.8, shrinkAbove: 1 }
  });
  const logCapacity = measured.assessments.find((item) => item.nicheId === 'niche-logs');
  const sqlCapacity = measured.assessments.find((item) => item.nicheId === 'niche-sql');
  assert.equal(logCapacity.capacity, 1);
  assert.equal(logCapacity.pressure, 2);
  assert.equal(logCapacity.action, 'shrink_or_migrate');
  assert.equal(sqlCapacity.capacity, 0);
  assert.equal(measured.assessments.reduce((sum, item) => sum + item.capacity, 0), 1);
  assert.equal(measured.requestedActions.length, 2);
  assert.equal(pressure.assessOccupancy(1, 4).action, 'recruit');
  assert.equal(pressure.assessOccupancy(3, 4).action, 'maintain');
  assert.equal(pressure.assessOccupancy(4, 4).action, 'throttle');
  assert.throws(() => pressure.assessOccupancy(1, 4, { recruitBelow: 0.9, throttleAt: 0.8 }), { code: 'BIOME_PRESSURE_THRESHOLDS_INVALID' });

  const snapshot = await biome.sessionSnapshot(session.sessionId);
  assert.equal(snapshot.niches.find((item) => item.nicheId === 'niche-logs').capacityKnown, true);
  assert.equal(snapshot.ecologicalState.nichePressure.length, 2);
  console.log('Biome carrying capacity checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
