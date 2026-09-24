'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const succession = require('../src/services/holobionte/succession/symbiontSuccessionService');

async function setup(db) {
  const session = await store.createSession(db, { hostId: 'succession-host', missionId: 'release-1' });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'succession' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 2,
    payload: { symbiontId: 'implementation-coder', symbiont: { id: 'implementation-coder' } }
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'implementation-coder', capabilitiesOffered: ['code'],
      dependencyCeiling: 0.4, resourcesRequested: { tokens: 20 }, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['code'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['code-proof'], expectedBenefit: { quality: 'higher' },
      maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['release-complete']
    }
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_ADMITTED', expectedRevision: 3,
    payload: { symbiontId: 'implementation-coder', receipt: { receiptId: 'coder-admission' } }
  });
  const admitted = await store.getSession(db, session.holobiontId);
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'RESOURCE_GRANTED', expectedRevision: admitted.revision,
    payload: { symbiontId: 'implementation-coder', allocationId: 'coder-allocation', resources: { tokens: 10 } }
  });
  return store.getSession(db, session.holobiontId);
}

async function testDormancyAndResume(db) {
  const session = await setup(db);
  const applied = await succession.applySuccession(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    phase: 'RELEASE', requiredCapabilities: ['security', 'deployment'], actorId: 'host'
  });
  assert.deepStrictEqual(applied.dormantSymbiontIds, ['implementation-coder']);
  assert.strictEqual(applied.session.residentSymbionts[0].status, 'DORMANT');
  assert.strictEqual(applied.session.resourceState.allocations['implementation-coder'], undefined);
  assert.deepStrictEqual(applied.missingCapabilities, ['security', 'deployment']);
  const resumed = await succession.resumeDormantSymbiont(db, {
    holobiontId: session.holobiontId, symbiontId: 'implementation-coder',
    expectedSessionRevision: applied.session.revision,
    evidenceRefs: ['proof:phase-rollback-requires-code'], verifierId: 'host-verifier'
  });
  assert.strictEqual(resumed.resumed, true);
  assert.strictEqual((await store.getSession(db, session.holobiontId)).residentSymbionts[0].status, 'RESIDENT');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await testDormancyAndResume(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont succession tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont succession tests failed:', error);
  process.exitCode = 1;
});
