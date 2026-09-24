'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitutionService = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const recovery = require('../src/services/holobionte/symbionts/symbiontRecoveryService');

function contract(hostId, symbiontId, dependencyCeiling) {
  return {
    hostId, symbiontId, capabilitiesOffered: ['review'], dependencyCeiling,
    resourcesRequested: { tokens: 100 }, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: ['review'] }, toolLeases: [], dataAccess: [],
    privacyBoundary: {}, evidenceRequirements: ['review-result'], expectedBenefit: { quality: 'higher' },
    maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
    terminationConditions: ['mission-done']
  };
}

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  const session = await store.createSession(db, {
    hostId: 'host-recovery', missionId: 'mission-recovery',
    residentSymbionts: [
      { id: 'sym-source', status: 'RESIDENT' },
      { id: 'sym-backup', status: 'RESIDENT' }
    ]
  });
  const constitution = constitutionService.createHostConstitution({
    hostId: session.hostId, identity: 'recovery-host', essentialCapabilities: ['review']
  });
  await constitutionService.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution, expectedRevision: 1
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 2,
    contract: contract(session.hostId, 'sym-source', 0.5)
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 2,
    contract: contract(session.hostId, 'sym-backup', 0.3)
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'RESOURCE_GRANTED', expectedRevision: 2,
    payload: { symbiontId: 'sym-source', allocationId: 'allocation-source', resources: { tokens: 40 } }
  });
  return session.holobiontId;
}

async function testReplacement(db, holobiontId) {
  const plan = await recovery.planReplacement(db, { holobiontId, symbiontId: 'sym-source' });
  assert.strictEqual(plan.recoveryStatus, 'BACKUP_READY');
  assert.strictEqual(plan.options[0].symbiontId, 'sym-backup');
  const before = await store.getSession(db, holobiontId);
  const replaced = await recovery.replaceWithResidentBackup(db, {
    holobiontId, symbiontId: 'sym-source', replacementSymbiontId: 'sym-backup',
    expectedSessionRevision: before.revision, reason: 'provider became unavailable'
  });
  assert.strictEqual(replaced.replaced, true);
  const restored = await store.getSession(db, holobiontId);
  assert.strictEqual(restored.revision, before.revision + 2);
  assert.strictEqual(restored.residentSymbionts.find((item) => item.id === 'sym-source').status, 'DORMANT');
  assert.strictEqual(restored.residentSymbionts.find((item) => item.id === 'sym-source').replacementSymbiontId, 'sym-backup');
  assert.strictEqual(restored.residentSymbionts.find((item) => item.id === 'sym-backup').status, 'RESIDENT');
  assert.strictEqual(restored.resourceState.allocations['sym-source'], undefined);
  const retry = await recovery.replaceWithResidentBackup(db, {
    holobiontId, symbiontId: 'sym-source', replacementSymbiontId: 'sym-backup',
    expectedSessionRevision: restored.revision, reason: 'retry'
  });
  assert.strictEqual(retry.idempotent, true);
  assert.strictEqual((await store.getSession(db, holobiontId)).revision, restored.revision);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const holobiontId = await setup(db);
    await testReplacement(db, holobiontId);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont recovery tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont recovery tests failed:', error);
  process.exitCode = 1;
});
