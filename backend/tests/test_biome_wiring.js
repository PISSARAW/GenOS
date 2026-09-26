const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const biomeStore = require('../src/services/biome/biomeStore');

async function run() {
const composition = await biome.composeBiome('Operate an environment with specialized agent populations and shared resources.');
assert.equal(composition.variant, 'resource');
assert.equal(composition.variantSelection.method, 'mission_signals');
assert.equal(composition.members.length, 4);
assert.ok(composition.sessionId);
assert.equal(composition.organization, 'energy_huddle');
assert.deepEqual(composition.capabilityContract.required, ['EPISODIC_MEMORY', 'FOVEAL_PERCEPTION', 'QUORUM', 'RESILIENCE_RECOVERY', 'STIGMERGY', 'SWARM_METRICS', 'TOKEN_ECONOMY', 'WEB_FORAGING']);
assert.deepEqual(composition.mechanisms, ['resource_allocation', 'optimal_foraging', 'quorum_sensing']);
assert.ok(composition.members.every((member) => member.runtimeContext.sessionId === composition.sessionId));
assert.ok(composition.members.every((member) => member.runtimeContext.biomeId && member.runtimeContext.populationId && member.runtimeContext.nicheId));
assert.ok(composition.members.every((member) => member.mission.includes('BIOME VARIANT resource')));
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

const persistentBiome = await biome.composeBiome('Maintain a durable project environment.', { variant: 'persistent' });
assert.equal(persistentBiome.variant, 'persistent');
assert.equal(persistentBiome.ecology.scope, 'persistent');
assert.equal(persistentBiome.variantSelection.method, 'explicit');
const recoveryBiome = await biome.composeBiome('Recover resiliently from population failure.');
assert.equal(recoveryBiome.variant, 'resilience');
assert.equal(recoveryBiome.variantPolicy.recoveryReserveRatio, 0.15);
const recoveryAllocation = await biome.allocateSessionResources(recoveryBiome.sessionId,
  [{ id: 'recovery_population', demand: 1, priority: 1 }], { totalBudget: 100 });
assert.equal(recoveryAllocation.recoveryReserveBudget, 15);
assert.equal(recoveryAllocation.spendableBudget, 85);
assert.equal((await biome.sessionSnapshot(recoveryBiome.sessionId)).ecologicalState.recoveryBudgetReserve, 15);
const recoveryDecision = await biome.advanceSessionVariant(recoveryBiome.sessionId, {
  recover: true, recoveryCost: 10, failedPopulationIds: ['failed'], evidenceRefs: ['artifact:recovery']
});
assert.equal(recoveryDecision.decision.reserveUsed, 0);
assert.equal((await biome.sessionSnapshot(recoveryBiome.sessionId)).ecologicalState.recoveryBudgetReserve, 15);
const diversityBiome = await biome.composeBiome('Preserve quality and diversity across populations.');
const diversity = await biome.assessSessionHealth(diversityBiome.sessionId, ['scout', 'scout']);
assert.deepEqual(diversity.qualityDiversity, { target: 0.7, met: false });
const qualityCandidate = await biome.advanceSessionVariant(diversityBiome.sessionId, {
  descriptor: [0.2, 0.8], quality: 0.8, evidenceRefs: ['artifact:quality']
});
assert.equal(qualityCandidate.decision.accepted, true);
const multiScaleBiome = await biome.composeBiome('Report ecosystem effects at multiple scales and multi-scale systems.');
const scales = await biome.assessSessionHealth(multiScaleBiome.sessionId, ['scout']);
assert.equal(scales.ecologicalScales.population.count, 0);
const computeBiome = await biome.composeBiome('Allocate GPU compute across hardware resources.');
const computeAllocation = await biome.allocateSessionResources(computeBiome.sessionId, [
  { id: 'gpu-ready', demand: 1, priority: 1, computeAvailability: 1 },
  { id: 'cpu-limited', demand: 1, priority: 1, computeAvailability: 0.25 }
], { totalBudget: 100 });
assert.deepEqual(computeAllocation.allocations.map((entry) => entry.budget), [80, 20]);
const knowledgeBiome = await biome.composeBiome('Research source collections and cite the literature.');
const sourceDiscovery = await biome.discoverSessionNiches(knowledgeBiome.sessionId, [], {
  knowledgeSources: [{ id: 'paper-1', title: 'Evidence source', evidenceRefs: ['paper:1'], relevance: 0.6 }]
});
assert.equal(sourceDiscovery.candidates[0].evidenceRefs[0], 'paper:1');
const openEndedBiome = await biome.composeBiome('Discover useful options in an open-ended problem.');
await biome.updateSessionEnvironment(openEndedBiome.sessionId, {
  opportunities: [{ id: 'idea-1', descriptor: 'Low score opportunity', evidenceRefs: ['artifact:idea'], opportunityScore: 0.05 }]
});
const openDiscovery = await biome.discoverSessionNiches(openEndedBiome.sessionId);
const openedNiche = await biome.updateNicheLifecycle({
  sessionId: openEndedBiome.sessionId, nicheId: openDiscovery.candidates[0].nicheId
});
assert.equal(openedNiche.niche.status, 'open');
const successionBiome = await biome.composeBiome('Move the long project through its succession phases.');
assert.equal((await biome.sessionSnapshot(successionBiome.sessionId)).ecologicalState.successionPhase, 'pioneer');
await biome.updateSessionEnvironment(successionBiome.sessionId, {
  opportunities: [{ id: 'phase-candidate', descriptor: 'Evidence-backed niche', evidenceRefs: ['artifact:phase'], opportunityScore: 0.8 }]
});
await biome.discoverSessionNiches(successionBiome.sessionId);
assert.equal((await biome.sessionSnapshot(successionBiome.sessionId)).ecologicalState.successionPhase, 'pioneer');
const phaseDecision = await biome.advanceSessionVariant(successionBiome.sessionId, {
  transition: true, evidenceRefs: ['artifact:phase-transition'], productivity: 0.7, stability: 0.8
});
assert.equal(phaseDecision.decision.phase, 'pioneer');
assert.equal(phaseDecision.decision.conditions.ready, false);
assert.throws(() => biome.selectBiomeVariant('Unknown task', { variant: 'invented' }), { code: 'BIOME_VARIANT_UNKNOWN' });

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
