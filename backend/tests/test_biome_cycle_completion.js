'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');

const environment = { opportunities: [{
  id: 'logs', descriptor: 'Analyze observed logs', opportunityScore: 0.9,
  evidenceRefs: ['artifact:logs'], requiredCapabilities: ['logs'],
  resourceProfile: { tokens: { minimum: 1, preferred: 20, maximum: 100 } }
}] };

async function budgetAndDiscovery() {
  const runtime = await biome.BiomeRuntime.create('Ecological resource mission', { variant: 'resource', environment, maxTicks: 20 });
  const first = await runtime.step({ resources: { tokens: 100 }, totalBudget: 100,
    individuals: [{ individualId: 'reader', capabilities: ['logs'] }] });
  assert.equal(first.tick, 1);
  assert.equal(first.measurements.resources.budgetUsed, 0);
  const snapshot = await biome.sessionSnapshot(runtime.sessionId);
  const population = snapshot.populations.find(p => p.nicheId === 'niche-logs');
  assert.equal(population.individuals.length, 1);
  const result = { id: 'result-1', populationId: population.populationId,
    productivity: 0.8, informationGain: 0.9, resources: { tokens: 5 },
    evidenceRefs: ['test:logs'], artifact: 'artifact:report' };
  const second = await runtime.step({ populationResults: [result] });
  assert.equal(second.measurements.resources.budgetUsed, 5);
  assert.equal(second.stopCondition, null);
  const balance = second.measurements.resources.balances.tokens;
  assert.equal(balance + second.measurements.resources.recoveryReserve.tokens + 5, 100);
  const repeated = await runtime.step({ populationResults: [result], resources: { tokens: 100 } });
  assert.equal(repeated.measurements.resources.budgetUsed, 5);
  assert.equal(repeated.measurements.resources.balances.tokens, balance);
  const final = await biome.sessionSnapshot(runtime.sessionId);
  assert.equal(final.archive.length, 1);
  assert.ok(final.entries.some(entry => entry.kind === 'environmental_trail'));
  assert.equal(final.revision, 3);
  assert.equal(final.populations.find(p => p.populationId === population.populationId).individuals[0].fitnessReceipts.length, 1);
  const before = structuredClone(final);
  await assert.rejects(() => runtime.step({ tokenCost: 1000 }), { code: 'BIOME_BUDGET_EXCEEDED' });
  assert.deepEqual(await biome.sessionSnapshot(runtime.sessionId), before);
}

async function stopAndProof() {
  const runtime = await biome.BiomeRuntime.create('No proof from idleness', { variant: 'resource', maxTicks: 15 });
  const results = await runtime.run({ totalBudget: 100, goalAchieved: true }, 15);
  assert.equal(results.length, 15);
  assert.equal(results.at(-1).stopCondition, 'max_ticks_reached');
  assert.equal(runtime.state.goalVerification, undefined);
  assert.equal((await runtime.run({}, 2)).length, 0);
  const goal = await biome.BiomeRuntime.create('Explicit goal verifier', { maxTicks: 10, variant: 'resource',
    verifyGoal: async request => ({ sessionId: request.sessionId, tick: request.tick,
      verified: true, evidenceRefs: ['test:independent-goal'] }) });
  assert.equal((await goal.step()).stopCondition, 'goal_achieved');
  const forged = await biome.BiomeRuntime.create('Stale goal receipt', { maxTicks: 2, variant: 'resource',
    verifyGoal: async request => ({ sessionId: request.sessionId, tick: 0, verified: true, evidenceRefs: ['stale'] }) });
  assert.equal((await forged.step()).goalVerification.verified, false);
  await assert.rejects(() => biome.BiomeRuntime.create('bad limit', { maxTicks: -1 }), { code: 'BIOME_TICK_LIMIT_INVALID' });
  const abort = new AbortController();
  abort.abort();
  const cancelled = await biome.BiomeRuntime.create('Cancelled mission', { variant: 'resource', signal: abort.signal });
  assert.equal((await cancelled.step()).stopCondition, 'cancelled');
}

async function rollbackAndConflict() {
  const session = await biome.composeBiome('Atomic cycle', { variant: 'resource', environment });
  const before = await biome.sessionSnapshot(session.sessionId);
  await assert.rejects(() => biome.advanceSessionCycle(session.sessionId, {
    individuals: [{ individualId: 'created', capabilities: ['logs'] }],
    populationResults: [{ id: 'invalid', populationId: 'unknown', productivity: 1, evidenceRefs: ['test:invalid'] }]
  }), { code: 'BIOME_RESULT_INVALID' });
  assert.deepEqual(await biome.sessionSnapshot(session.sessionId), before);
  const attempts = await Promise.allSettled([
    biome.advanceSessionCycle(session.sessionId, {}, { expectedRevision: 0 }),
    biome.advanceSessionCycle(session.sessionId, {}, { expectedRevision: 0 })
  ]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(r => r.status === 'rejected').reason.code, 'BIOME_SESSION_CONFLICT');
}

async function main() {
  await budgetAndDiscovery();
  await stopAndProof();
  await rollbackAndConflict();
  console.log('Biome autonomous cycles, conservation, rollback and proof gates: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
