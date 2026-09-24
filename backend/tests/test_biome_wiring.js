const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const biomeStore = require('../src/services/biome/biomeStore');

async function run() {
const composition = await biome.composeBiome('Operate an environment with specialized agent populations and shared resources.');
assert.equal(composition.members.length, 4);
assert.ok(composition.sessionId);
assert.equal(composition.organization, 'energy_huddle');
assert.deepEqual(composition.capabilityContract.required, ['EPISODIC_MEMORY', 'FOVEAL_PERCEPTION', 'QUORUM', 'RESILIENCE_RECOVERY', 'STIGMERGY', 'SWARM_METRICS', 'TOKEN_ECONOMY', 'WEB_FORAGING']);
assert.deepEqual(composition.mechanisms, ['resource_allocation', 'optimal_foraging', 'quorum_sensing']);
assert.ok(composition.members.every((member) => member.runtimeContext.sessionId === composition.sessionId));
assert.ok(composition.members.every((member) => member.runtimeContext.biomeId && member.runtimeContext.populationId && member.runtimeContext.nicheId));
assert.deepEqual(Object.keys(composition.ecology), [
  'biomeId', 'missionId', 'scope', 'environment', 'environmentConstraints', 'opportunityMap', 'niches', 'populations', 'resourcePool',
  'interactionGraph', 'archive', 'ecologicalState', 'tick', 'status'
]);

const canonical = biomeStore.createBiomeState({
  biomeId: 'biome-canonical',
  scope: 'workspace',
  niches: [{ nicheId: 'niche-tests', opportunityScore: 0.8 }],
  populations: [{ populationId: 'population-tests', nicheId: 'niche-tests', resourcePool: { tokens: 10 } }],
  interactionGraph: [{ sourceId: 'search', targetId: 'verify', type: 'mutualism', strength: 0.6 }],
  resourcePool: { tokens: 100, workerSlots: 4 }
});
assert.equal(canonical.environment.version, 1);
assert.equal(canonical.niches[0].status, 'candidate');
assert.equal(canonical.populations[0].resourcePool.tokens, 10);
assert.equal(canonical.interactionGraph[0].type, 'mutualism');
assert.equal(canonical.resourcePool.tokens, 100);
assert.throws(() => biomeStore.createBiomeState({ biomeId: 'bad', scope: 'planet' }), { code: 'BIOME_CONTRACT_INVALID' });

const allocation = biome.allocateResources([
  { id: 'population_a', demand: 2, priority: 2 },
  { id: 'population_b', demand: 1, priority: 1 }
], { totalBudget: 100, minimumPerPopulation: 10 });
assert.equal(allocation.allocations[0].budget, 74);
assert.equal(allocation.allocations[1].budget, 26);
assert.equal(allocation.conserved, true);
const rounded = biome.allocateResources([
  { id: 'b', demand: 1, priority: 1 }, { id: 'a', demand: 1, priority: 1 }, { id: 'c', demand: 1, priority: 1 }
], { totalBudget: 10, minimumPerPopulation: 1 });
assert.equal(rounded.allocations.reduce((sum, item) => sum + item.budget, 0), 10);
assert.deepEqual(rounded.allocations.map((item) => item.budget), [3, 4, 3]);
assert.throws(() => biome.allocateResources([{ id: 'a', demand: 1, priority: 1 }], { totalBudget: 2, minimumPerPopulation: 3 }), { code: 'BIOME_ALLOCATION_INVALID' });
assert.throws(() => biome.allocateResources([{ id: 'a', demand: -1, priority: 1 }], { totalBudget: 2 }), { code: 'BIOME_ALLOCATION_INVALID' });
assert.throws(() => biome.allocateResources([{ id: 'a', demand: 1, priority: 1 }, { id: 'a', demand: 1, priority: 1 }], { totalBudget: 2 }), { code: 'BIOME_ALLOCATION_INVALID' });
const sessionAllocation = await biome.allocateSessionResources(composition.sessionId, [{ id: 'session_pop', demand: 1, priority: 1 }], { totalBudget: 20 });
assert.equal(sessionAllocation.allocations[0].budget, 20);
assert.equal(sessionAllocation.receipt.previousRevision, 0);
assert.equal(sessionAllocation.receipt.resultingRevision, 1);
const environmentChange = await biome.updateSessionEnvironment(composition.sessionId, {
  constraints: [{ id: 'token-cap', resource: 'tokens', maximum: 50 }],
  opportunities: [{ id: 'logs', descriptor: 'Inspect logs', evidenceRefs: ['artifact:logs'], opportunityScore: 0.8 }]
}, { reason: 'explicit environment evidence', evidenceRefs: ['artifact:logs'] });
assert.equal(environmentChange.environment.version, 2);
assert.equal(environmentChange.receipt.resultingRevision, 2);
const ecologySnapshot = await biome.sessionSnapshot(composition.sessionId);
assert.equal(ecologySnapshot.opportunities[0].status, 'candidate');
assert.equal(ecologySnapshot.environment.version, 2);

const step = biome.forageStep([{ infoGain: 3 }], { iteration: 3, elapsedTimeSec: 2 });
assert.ok(typeof step.patchYield.decision === 'string');
assert.ok(Number.isFinite(step.levyStep.stepLength));
assert.ok(typeof step.levyStep.mode === 'string');
await biome.forageSession(composition.sessionId, [{ infoGain: 3 }], { iteration: 2, elapsedTimeSec: 1 });
const departure = await biome.forageSession(composition.sessionId, [{ infoGain: 0 }], {
  iteration: 3, elapsedTimeSec: 1, alternativePatch: 'timing-anomalies'
});
assert.equal(departure.patchYield.decision, 'PATCH_DEPARTURE');
assert.deepEqual(departure.receipt.appliedActions, [{ type: 'MIGRATE_AND_EXECUTE_PATCH', status: 'requested', targetPatch: 'timing-anomalies' }]);

const resilient = biome.ecosystemHealth(['pollinate', 'graze', 'scout', 'harvest', 'migrate', 'burrow']);
assert.equal(resilient.ecosystemHealth, 'unknown');
assert.equal(resilient.behavioralDiversity, 1);
assert.equal(resilient.verdict, 'unknown');
assert.equal(biome.ecosystemHealth([]).verdict, 'unknown');
await biome.assessSessionHealth(composition.sessionId, ['pollinate', 'graze']);
assert.equal((await biome.sessionSnapshot(composition.sessionId)).entries.length, 4);

await assert.rejects(() => biome.composeBiome(''), (error) => error.code === 'BIOME_MISSION_REQUIRED');
console.log('Biome wiring checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
