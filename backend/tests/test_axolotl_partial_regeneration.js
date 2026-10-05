'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/axolotlRegenerationService');
const store = require('../src/services/axolotlStateStore');
const { fixture, topology, planInput } = require('./axolotlTestHarness');
async function main() {
  const test = await fixture();
  let db = test.db;
  try {
    const plan = await service.planRegeneration(planInput(db));
    await db.close();
    db = await test.reopen();
    const saved = await service.getRegenerationSession(plan.sessionId, { db, orchestratorId: 'parent' });
    assert.equal(saved.status, 'planned');
    await assert.rejects(service.getRegenerationSession(plan.sessionId, { db, orchestratorId: 'stranger' }), { code: 'AXOLOTL_SESSION_ACCESS_DENIED' });
    const attempts = await Promise.allSettled([1, 2].map(() => service.executeRegeneration({ sessionId: plan.sessionId, db, context: { orchestratorId: 'parent' } })));
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    const result = attempts.find((attempt) => attempt.status === 'fulfilled').value;
    assert.equal(result.success, true);
    assert.equal(result.validation.isolated, true);
    assert.equal(result.validation.probes.every((probe) => probe.passed), true);
    const restored = result.newTopology.components.find((node) => node.regeneratedFrom === 'damaged');
    assert.ok(restored);
    assert.deepEqual(result.newTopology.components.filter((node) => node.id === 'memory' || node.id === 'input'), topology().components.filter((node) => node.id !== 'damaged'));
    assert.ok(result.newTopology.connections.some((edge) => edge.from === 'input' && edge.to === restored.id && edge.weight === 2));
    assert.ok(result.newTopology.connections.some((edge) => edge.from === restored.id && edge.to === 'memory'));
    assert.ok(result.newTopology.connections.some((edge) => edge.from === 'memory' && edge.to === restored.id));
    const proof = await store.evidence(db, result.evidenceRef);
    assert.equal(proof.subjectHash, store.hash(result.newTopology));
    const rollback = await service.rollbackRegeneration({ db, sessionId: plan.sessionId, orchestratorId: 'parent', reason: 'Regression outside the probes' });
    assert.equal(rollback.success, true);
    assert.deepEqual((await store.read(db, { kind: 'topology', id: 'parent' })).topology, topology());
    console.log('Axolotl partial regeneration, restart, isolation, concurrency and rollback: passed');
  } finally { await db.close(); await test.cleanup(); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });