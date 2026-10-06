'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/axolotlRegenerationService');
const store = require('../src/services/axolotlStateStore');
const { fixture, planInput } = require('./axolotlTestHarness');
async function main() {
  const test = await fixture();
  const db = test.db;
  try {
    await assert.rejects(service.executeRegeneration({ db, sessionId: 'missing', context: { orchestratorId: 'parent' } }), { code: 'AXOLOTL_SESSION_NOT_FOUND' });
    const damaged = planInput(db);
    damaged.currentTopology.connections = [{ from: 'memory', to: 'damaged', type: 'feedback' }];
    damaged.currentTopology.components[1].status = 'failed';
    const plan = await service.planRegeneration(damaged);
    const session = await service.getRegenerationSession(plan.sessionId, { db, orchestratorId: 'parent' });
    await store.save(db, { kind: 'session', id: session.id, expectedVersion: session.version,
      value: { ...session, status: 'executing', deadline: Date.now() - 1, runId: 'interrupted', startedAt: Date.now() - 1000 } });
    const repaired = await service.executeRegeneration({ db, sessionId: plan.sessionId, context: { orchestratorId: 'parent' } });
    assert.equal(repaired.success, true);
    assert.ok(repaired.newTopology.connections.some((edge) => edge.type === 'recovery_route'));
    const active = await store.activeTopology(db, 'parent');
    const next = { ...planInput(db), currentTopology: active.topology, scope: { type: 'global' }, executionBudget: { durationMs: 1 } };
    const timeout = await service.planRegeneration(next);
    const stopped = await service.executeRegeneration({ db, sessionId: timeout.sessionId, context: { orchestratorId: 'parent' } });
    assert.equal(stopped.success, false);
    assert.equal(stopped.code, 'AXOLOTL_DURATION_BUDGET_EXHAUSTED');
    assert.equal((await store.activeTopology(db, 'parent')).version, active.version);
    console.log('Axolotl missing-session recovery, interrupted-run resume, structural repair and timeout: passed');
  } finally { await db.close(); await test.cleanup(); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });