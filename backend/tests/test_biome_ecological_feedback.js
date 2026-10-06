'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const observer = require('../src/services/biome/runtime/ecosystemObserver');

function opportunity(id) {
  return { id, descriptor: id, opportunityScore: 1, evidenceRefs: ['test:' + id],
    requiredCapabilities: [id], resourceProfile: { tokens: { minimum: 1, preferred: 10, maximum: 100 } } };
}

function result(id, niche, measurement) {
  const { productivity, ...extra } = typeof measurement === 'number' ? { productivity: measurement } : measurement;
  return { id, populationId: 'population:niche-' + niche, productivity,
    evidenceRefs: ['test:' + id], ...extra };
}

async function feedbackAndAdaptation() {
  let observed;
  const runtime = await biome.BiomeRuntime.create('Measured ecological feedback', {
    variant: 'exploration', maxTicks: 10, environment: { opportunities: [opportunity('a'), opportunity('b')] },
    authorizeExecution: async () => true,
    executors: { local: async request => { observed = request; return { output: 'done', consumed: {} }; } },
    verifyExecution: async proof => ({ ...proof, verified: true, evidenceRefs: ['test:output'] })
  });
  await runtime.step({ resources: { tokens: 100 }, totalBudget: 100,
    individuals: [{ individualId: 'a-worker', capabilities: ['a'] }, { individualId: 'b-worker', capabilities: ['b'] }] });
  await runtime.step({ populationResults: [result('a-1', 'a', { productivity: 0.2, predictionError: 0.8 }),
    result('b-1', 'b', { productivity: 0.9, predictionError: 0.7 })] });
  const cycle = await runtime.step({ populationId: 'population:niche-a', currentPatchId: 'niche-a', currentMarginalReturn: 0,
    migrationCost: { tokens: 2 }, populationResults: [result('a-2', 'a', { productivity: 0.3, predictionError: 0.4,
      environmentPatch: { opportunities: [opportunity('a'), opportunity('b'), opportunity('c')] } })],
    populationCommands: [{ type: 'adapt', populationId: 'population:niche-a', individualId: 'a-worker',
      patch: { strategy: 'measured-search', temperature: 0.2 }, evidenceRefs: ['test:learning'] }],
    interactions: [{ sourceId: 'population:niche-a', targetId: 'population:niche-b',
      type: 'mutualism', strength: 0.8, confidence: 1, historicalEffect: 0.6, evidenceRefs: ['test:dependency'] }] });
  assert.equal(cycle.action.type, 'MIGRATE_AND_EXECUTE_PATCH');
  assert.equal(cycle.action.status, 'applied');
  assert.ok(cycle.decision.curiosity > 0);
  assert.equal(cycle.measurements.resources.budgetUsed, 2);
  let snapshot = await biome.sessionSnapshot(runtime.sessionId);
  assert.equal(snapshot.populations.find(p => p.populationId === 'population:niche-a').patchId, 'niche-b');
  assert.equal(snapshot.ecologicalState.nicheConstructions.length, 1);
  assert.equal(snapshot.interactionGraph.length, 1);
  await biome.executeSessionWork(runtime.sessionId, { executionId: 'adapted-work', populationId: 'population:niche-a',
    individualId: 'a-worker', providerId: 'local', capability: 'a', input: {}, resources: {} }, runtime.options);
  assert.equal(observed.phenotype.strategy, 'measured-search');
  assert.equal(observed.patchId, 'niche-b');
  await runtime.step({ individuals: [{ individualId: 'c-worker', capabilities: ['c'] }] });
  snapshot = await biome.sessionSnapshot(runtime.sessionId);
  assert.ok(snapshot.niches.some(n => n.nicheId === 'niche-c'));
  assert.equal(snapshot.populations.find(p => p.nicheId === 'niche-c').individuals.length, 1);
  const before = structuredClone(snapshot);
  await assert.rejects(() => runtime.step({ populationCommands: [{ type: 'adapt',
    populationId: 'population:niche-a', individualId: 'a-worker', patch: { capabilities: ['admin'] },
    evidenceRefs: ['test:invalid'] }] }), { code: 'BIOME_PHENOTYPE_INVALID' });
  assert.deepEqual(await biome.sessionSnapshot(runtime.sessionId), before);
}

async function disturbanceAndRecovery() {
  const runtime = await biome.BiomeRuntime.create('Measured recovery', {
    variant: 'resilience', maxTicks: 10, environment: { opportunities: [opportunity('a'), opportunity('b')] },
    verifyGoal: async proof => ({ sessionId: proof.sessionId, tick: proof.tick,
      verified: proof.tick === 3, evidenceRefs: ['test:local-success'] })
  });
  await runtime.step({ resources: { tokens: 100 }, totalBudget: 100,
    individuals: [{ individualId: 'a-worker', capabilities: ['a'] }, { individualId: 'b-worker', capabilities: ['b'] }] });
  await runtime.step({ populationResults: [result('baseline-a', 'a', 8), result('baseline-b', 'b', 2)] });
  const disturbed = await runtime.step({ confirmLocalExtinction: true, failedPopulationIds: ['population:niche-a'],
    evidenceRefs: ['test:confirmed-outage'], disturbanceId: 'outage' });
  assert.equal(disturbed.goalVerification.verified, false);
  assert.equal(disturbed.measurements.recovery.status, 'disturbed');
  assert.equal(disturbed.measurements.recovery.resistance, 0.2);
  const restored = await runtime.step({ recolonizePopulationId: 'population:niche-a',
    recoveryCost: 3, evidenceRefs: ['test:refuge'] });
  assert.equal(restored.measurements.recovery.status, 'disturbed');
  assert.equal(restored.measurements.resources.budgetUsed, 3);
  const measured = await runtime.step({ populationResults: [result('recovered-a', 'a', 8)] });
  assert.equal(measured.measurements.recovery.status, 'recovered');
  assert.equal(measured.measurements.recovery.resistance, 1);
  assert.equal(measured.measurements.recovery.recoveryTicks, 2);
  assert.equal(observer.measure(runtime.ecology).resources.balances.tokens + measured.measurements.resources.recoveryReserve.tokens + 3, 100);
  await assert.rejects(() => runtime.step({ populationCommands: [{ type: 'resource_consume',
    populationId: 'population:niche-a', resources: { tokens: 100 } }] }), { code: 'BIOME_RESOURCE_INSUFFICIENT' });
}

async function executableForaging() {
  let calls = 0;
  const runtime = await biome.BiomeRuntime.create('Forage and execute', {
    variant: 'exploration', maxTicks: 3, environment: { opportunities: [opportunity('a')] },
    authorizeExecution: async () => true,
    executors: { local: async request => { calls += 1; return { output: request.input.value * 2, consumed: { tokens: 2 } }; } },
    verifyExecution: async proof => ({ ...proof, verified: proof.output === 4, evidenceRefs: ['test:foraging-operation'] })
  });
  await runtime.step({ totalBudget: 100, resources: { tokens: 100 },
    individuals: [{ individualId: 'worker', capabilities: ['a'] }] });
  const next = await runtime.step({ currentPatchId: 'niche-a', currentMarginalReturn: 0,
    alternatives: [{ patchId: 'valuable-patch', expectedReturn: 1,
      operation: { providerId: 'local', capability: 'a', input: { value: 2 }, resources: { tokens: 5 } } }] });
  assert.equal(calls, 1);
  assert.equal(next.executions[0].execution.status, 'verified');
  assert.equal(next.measurements.resources.budgetUsed, 2);
  assert.equal((await biome.sessionSnapshot(runtime.sessionId)).ecologicalState.patchExecutions[0].status, 'verified');
}

async function computeDispatch() {
  let calls = 0;
  const runtime = await biome.BiomeRuntime.create('Compute provider dispatch', {
    variant: 'compute', maxTicks: 3, environment: { opportunities: [opportunity('a')] },
    authorizeExecution: async () => true,
    executors: { cheap: async () => { calls += 1; return { output: 4, consumed: { tokens: 2 } }; },
      expensive: async () => { throw new Error('Wrong provider selected'); } },
    verifyExecution: async proof => ({ ...proof, verified: proof.output === 4, evidenceRefs: ['test:compute-result'] })
  });
  await runtime.step({ totalBudget: 100, resources: { tokens: 100 },
    individuals: [{ individualId: 'worker', capabilities: ['a'] }] });
  const cycle = await runtime.step({ demand: { tokens: 3 },
    providers: [{ id: 'cheap', resources: { tokens: 100 }, costUsd: 1 },
      { id: 'expensive', resources: { tokens: 100 }, costUsd: 5 }],
    computeWork: { executionId: 'computed-work', populationId: 'population:niche-a',
      individualId: 'worker', providerId: 'expensive', capability: 'a', input: {}, resources: { tokens: 3 } } });
  assert.equal(cycle.decision.selected.id, 'cheap');
  assert.equal(cycle.executions[0].execution.providerId, 'cheap');
  assert.equal(cycle.executions[0].execution.status, 'verified');
  assert.equal(calls, 1);
}

async function changingOpportunity() {
  const runtime = await biome.BiomeRuntime.create('Changing capabilities', {
    variant: 'resource', maxTicks: 3, environment: { opportunities: [opportunity('a')] }
  });
  await runtime.step({ resources: { tokens: 100 }, totalBudget: 100,
    individuals: [{ individualId: 'old-worker', capabilities: ['a'] }] });
  await runtime.step({ environmentPatch: { opportunities: [{ ...opportunity('a'),
    requiredCapabilities: ['b'], opportunityScore: 0.7 }] }, evidenceRefs: ['test:changed-environment'] });
  const state = await biome.sessionSnapshot(runtime.sessionId);
  assert.deepEqual(state.niches[0].requiredCapabilities, ['b']);
  assert.equal(state.niches[0].opportunityScore, 0.7);
  assert.equal(state.populations[0].individuals.length, 0);
  assert.equal(state.ecologicalState.dormantIndividuals[0].individual.individualId, 'old-worker');
}

async function main() {
  await feedbackAndAdaptation();
  await disturbanceAndRecovery();
  await changingOpportunity();
  await executableForaging();
  await computeDispatch();
  console.log('Biome measured curiosity, construction, stigmergy, phenotype, rewiring and recovery: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
