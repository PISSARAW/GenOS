'use strict';
const assert = require('node:assert/strict');
const cost = require('../src/services/axolotlRegenerationCostService');
const service = require('../src/services/axolotlRegenerationService');
const store = require('../src/services/axolotlStateStore');
const { observe, costReport } = require('../src/services/axolotlObservationService');
const { fixture, planInput } = require('./axolotlTestHarness');
async function main() {
  assert.deepEqual(cost.accumulate(null, { tokens: null, costUsd: '0.1', events: 3, durationMs: 1 }), { source: 'runtime_observation', events: 3, durationMs: 1 });
  assert.equal(cost.compareObservations([]).status, 'insufficient_observations');
  const test = await fixture();
  const db = test.db;
  try {
    const input = planInput(db);
    input.executionBudget = { events: 3 };
    const plan = await service.planRegeneration(input);
    const result = await service.executeRegeneration({ db, sessionId: plan.sessionId, context: { orchestratorId: 'parent', observedCost: { costUsd: 100 } } });
    assert.equal(result.success, false);
    assert.equal(result.code, 'AXOLOTL_EVENT_BUDGET_EXHAUSTED');
    const session = await service.getRegenerationSession(plan.sessionId, { db, orchestratorId: 'parent' });
    assert.equal(session.status, 'failed');
    assert.equal(session.experimentCost.events, 2);
    assert.equal((await store.read(db, { kind: 'topology', id: 'parent' })).version, 1);
    for (let index = 0; index < 3; index++) await observe({ db, orchestratorId: 'parent' });
    await store.save(db, { kind: 'plasticity', id: 'parent', value: { state: 'STABLE' } });
    for (let index = 0; index < 3; index++) await observe({ db, orchestratorId: 'parent' });
    const report = await costReport({ db, orchestratorId: 'parent' });
    assert.equal(report.comparison.status, 'measured');
    assert.equal(report.comparison.stableSamples, 3);
    assert.equal(report.comparison.plasticSamples, 3);
    assert.ok(Number.isFinite(report.comparison.durationDeltaMs));
    assert.equal(report.comparison.costUsd, undefined);
    console.log('Axolotl observed cost, budget refusal and measured stable/plastic comparison: passed');
  } finally { await db.close(); await test.cleanup(); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });