'use strict';
const assert = require('node:assert/strict');
const regulator = require('../src/services/development/plasticityRegulatorService');
const store = require('../src/services/axolotlStateStore');
const service = require('../src/services/axolotlRegenerationService');
const topology = require('../src/services/axolotlTopologyService');
const { observe } = require('../src/services/axolotlObservationService');
const { fixture, planInput } = require('./axolotlTestHarness');
async function age(db) {
  const state = await store.read(db, { kind: 'plasticity', id: 'parent' });
  await store.save(db, { kind: 'plasticity', id: 'parent', expectedVersion: state.version, value: { ...state, lastChangeAt: Date.now() - 31000 } });
}
async function main() {
  const test = await fixture();
  let db = test.db;
  try {
    const plan = await service.planRegeneration(planInput(db));
    assert.equal((await service.executeRegeneration({ db, sessionId: plan.sessionId, context: { orchestratorId: 'parent' } })).success, true);
    const request = { db, id: 'parent', reason: 'Contract observed' };
    assert.equal((await regulator.requestChange({ ...request, to: 'STABLE' })).reason, 'transition_not_allowed');
    assert.equal((await regulator.requestChange({ ...request, to: 'DIFFERENTIATING' })).ok, true);
    assert.equal((await regulator.requestChange({ ...request, to: 'CONSOLIDATING' })).reason, 'cooldown_active');
    await age(db);
    assert.equal((await regulator.requestChange({ ...request, to: 'CONSOLIDATING' })).reason, 'AXOLOTL_STABILITY_EVIDENCE_REQUIRED');
    const refs = [];
    for (let index = 0; index < 3; index++) refs.push((await observe({ db, orchestratorId: 'parent' })).evidenceRef);
    assert.equal((await regulator.requestChange({ ...request, to: 'CONSOLIDATING', evidenceRefs: refs })).ok, true);
    await assert.rejects(topology.assertMutable({ db, orchestratorId: 'parent' }), { code: 'AXOLOTL_TOPOLOGY_FROZEN' });
    await assert.rejects(require('../src/services/dynamicOrganizationService').changeOrganization(db, {
      orchestratorId: 'parent', organization: 'memory_compilation', changedBy: 'parent', reason: 'attempt bypass' }), { code: 'AXOLOTL_TOPOLOGY_FROZEN' });
    await age(db);
    assert.equal((await regulator.requestChange({ ...request, to: 'STABLE', evidenceRefs: [refs[0], refs[0], refs[0]] })).reason, 'AXOLOTL_STABILITY_EVIDENCE_REQUIRED');
    assert.equal((await regulator.requestChange({ ...request, to: 'STABLE', evidenceRefs: refs })).ok, true);
    await db.close();
    db = await test.reopen();
    assert.equal((await regulator.getPlasticity('parent', { db })).state, 'STABLE');
    assert.equal((await topology.getTopologyModeDurable('parent', { db })).mode, 'stabilisé');
    assert.equal((await regulator.requestChange({ ...request, db, to: 'EMERGENCY_PLASTIC' })).reason, 'AXOLOTL_EMERGENCY_EVIDENCE_REQUIRED');
    const active = await store.read(db, { kind: 'topology', id: 'parent' });
    active.topology.knowledge.rule = 'broken';
    await store.save(db, { kind: 'topology', id: 'parent', expectedVersion: active.version, value: active });
    const failure = await observe({ db, orchestratorId: 'parent' });
    assert.equal(failure.success, false);
    assert.equal((await regulator.requestChange({ ...request, db, to: 'EMERGENCY_PLASTIC', evidenceRefs: [failure.evidenceRef] })).ok, true);
    await topology.assertMutable({ db, orchestratorId: 'parent' });
    await age(db);
    const changes = await Promise.all(['PLASTIC', 'DIFFERENTIATING'].map((to) => regulator.requestChange({ ...request, db, to })));
    assert.equal(changes.filter((item) => item.ok).length, 1);
    console.log('Axolotl controlled metamorphosis, evidence, freeze, emergency and restart: passed');
  } finally { await db.close(); await test.cleanup(); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });