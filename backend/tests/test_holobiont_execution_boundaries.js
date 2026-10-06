'use strict';

const assert = require('node:assert/strict');
const { fixture, mission, symbiont, output, service, store, open, sqlite3 } = require('./helpers/holobiontMissionFixtures');
const runtime = require('../src/services/holobionte/runtime/holobiontRuntime');
const controller = require('../src/services/holobionte/runtime/holobiontController');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const resources = require('../src/services/holobionte/resources/symbioticResourceService');

async function contractRevokedDuringExecution() {
  const { db, input } = await fixture();
  try {
    await assert.rejects(() => runtime.runCycle(db, { ...input, executeCapability: async () => {
      const session = await store.getSession(db, input.holobiontId);
      await contracts.revokeContract(db, { holobiontId: input.holobiontId, symbiontId: 'calculator',
        expectedSessionRevision: session.revision, expectedContractRevision: 1, reason: 'concurrent revocation' });
      return output();
    } }), { code: 'HOLOBIONT_CONTRACT_REVISION_CONFLICT' });
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM holobiont_symbiosis_ledger')).count, 0);
    assert.deepEqual((await store.getSession(db, input.holobiontId)).resourceState.allocations, {});
  } finally { await db.close(); }
}

async function aggregateResourceLimit() {
  const { db, input } = await fixture();
  try {
    await service.admitMissionSymbiont(db, input, symbiont('second-calculator'));
    const session = await store.getSession(db, input.holobiontId);
    const grantInput = { holobiontId: input.holobiontId, symbiontId: 'calculator',
      expectedSessionRevision: session.revision, available: { tokens: 10 },
      policy: { tokens: { basal: 6, preferred: 6, maximum: 6 } } };
    const grant = await resources.grantResources(db, grantInput);
    await assert.rejects(() => resources.grantResources(db, { ...grantInput,
      symbiontId: 'second-calculator', expectedSessionRevision: grant.sessionRevision }), { code: 'HOLOBIONT_RESOURCE_UNAVAILABLE' });
  } finally { await db.close(); }
}

async function heartbeatAndGovernance() {
  const { db, input } = await fixture();
  try {
    const heartbeat = await controller.handleEvent(db, { eventType: 'RESIDENT_HEARTBEAT',
      payload: { holobiontId: input.holobiontId, symbiontId: 'calculator' } });
    assert.equal(heartbeat.status, 'HEALTH_ASSESSED');
    const result = await runtime.runCycle(db, { ...input, resourcePressure: 0.9 });
    assert.equal(result.health.automaticActionApplied, true);
    assert.equal(result.health.actionResult.action, 'THROTTLE');
    assert.equal((await contracts.getContract(db, input.holobiontId, 'calculator')).resourcesRequested.tokens, 10);
    const stopped = await controller.handleEvent(db, { eventType: 'MISSION_COMPLETED',
      payload: { holobiontId: input.holobiontId, missionId: input.missionId } });
    assert.equal(stopped.stopped, true);
  } finally { await db.close(); }
}

async function hostScopeAndPreflight() {
  const invalid = service.preflightHolobiontMission(mission({ steps: [{ capability: 'arithmetic', holobiontId: 'other-host' }] }));
  assert.equal(invalid.ready, false);
  assert.equal(invalid.code, 'HOLOBIONT_STEP_SCOPE_INVALID');
  const unallocated = service.preflightHolobiontMission(mission({ allocation: null }));
  assert.equal(unallocated.ready, false);
  assert.equal(unallocated.code, 'HOLOBIONT_RESOURCE_INVALID');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const first = await service.runHolobiontMission(db, mission({ persistentHost: true, projectId: 'project-a' }));
    const second = await service.runHolobiontMission(db, mission({ persistentHost: true, projectId: 'project-b' }));
    assert.notEqual(second.holobiontId, first.holobiontId);
    assert.equal(second.hostReused, false);
    await assert.rejects(() => service.openMissionHost(db, mission({ holobiontId: first.holobiontId,
      projectId: 'project-b' })), { code: 'HOLOBIONT_HOST_SCOPE_INVALID' });
  } finally { await db.close(); }
}

async function legacyMemoryMigration() {
  const { db } = await fixture();
  try {
    await db.exec('ALTER TABLE holobiont_memories DROP COLUMN reason');
    await require('../src/db/migrations/migrateHolobiontMemory').migrateHolobiontMemory(db);
    const columns = await db.all('PRAGMA table_info(holobiont_memories)');
    assert.equal(columns.some((column) => column.name === 'reason'), true);
  } finally { await db.close(); }
}

async function hostClosedDuringExecution() {
  const { db, input } = await fixture();
  try {
    await assert.rejects(() => runtime.runCycle(db, { ...input, executeCapability: async () => {
      const session = await store.getSession(db, input.holobiontId);
      await store.updateLifecycleStatus(db, { holobiontId: input.holobiontId, expectedRevision: session.revision,
        status: 'CLOSED', eventType: 'CLOSED', payload: { reason: 'concurrent closure' } });
      return output();
    } }), { code: 'HOLOBIONT_SESSION_INACTIVE' });
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM holobiont_symbiosis_ledger')).count, 0);
    assert.deepEqual((await store.getSession(db, input.holobiontId)).resourceState.allocations, {});
  } finally { await db.close(); }
}

async function main() {
  await hostClosedDuringExecution();
  await contractRevokedDuringExecution();
  await aggregateResourceLimit();
  await heartbeatAndGovernance();
  await hostScopeAndPreflight();
  await legacyMemoryMigration();
  console.log('Holobiont contract, budget, governance, scope and migration boundaries passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
