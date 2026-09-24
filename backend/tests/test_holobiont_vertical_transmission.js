'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const transmission = require('../src/services/holobionte/transmission/verticalTransmissionService');

async function prepareParent(db) {
  const session = await store.createSession(db, {
    hostId: 'parent-host', scope: 'PERSISTENT',
    residentSymbionts: [], candidateSymbionts: []
  });
  const hostConstitution = constitution.createHostConstitution({
    hostId: session.hostId, identity: 'lineage-host', transmissionPolicy: 'VERTICAL_PREFERRED'
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  let current = await store.getSession(db, session.holobiontId);
  await store.appendEvent(db, {
    holobiontId: current.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: current.revision,
    payload: { symbiontId: 'inherited-reviewer', symbiont: {
      id: 'inherited-reviewer', definition: { version: 2, capabilities: ['review'] },
      status: 'CANDIDATE'
    } }
  });
  await contracts.createContract(db, {
    holobiontId: current.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: current.hostId, symbiontId: 'inherited-reviewer', capabilitiesOffered: ['review'],
      dependencyCeiling: 0.4, resourcesRequested: {}, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['review'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['review-proof'], expectedBenefit: { quality: 'higher' },
      maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'VERTICAL_PREFERRED',
      terminationConditions: ['mission-complete']
    }
  });
  current = await store.getSession(db, session.holobiontId);
  await store.appendEvent(db, {
    holobiontId: current.holobiontId, eventType: 'SYMBIONT_ADMITTED', expectedRevision: current.revision,
    payload: { symbiontId: 'inherited-reviewer', receipt: { receiptId: 'admission-proof' } }
  });
  return store.getSession(db, session.holobiontId);
}

async function testTransmission(db) {
  const parent = await prepareParent(db);
  const result = await transmission.transmitVertically(db, {
    parentHolobiontId: parent.holobiontId, expectedParentRevision: parent.revision,
    childHostId: 'child-host', generation: 2, evidenceRefs: ['evidence:validated-genome']
  });
  assert.strictEqual(result.child.scope, 'PERSISTENT');
  assert.strictEqual(result.child.hostId, 'child-host');
  assert.deepStrictEqual(result.results.map((item) => item.status), ['CANDIDATE']);
  assert.strictEqual(result.child.candidateSymbionts[0].id, 'inherited-reviewer');
  assert.strictEqual(result.child.residentSymbionts.length, 0);
  assert.strictEqual((await contracts.getContract(db, result.child.holobiontId, 'inherited-reviewer')).hostId, 'child-host');
  const updatedParent = await store.getSession(db, parent.holobiontId);
  assert.strictEqual(updatedParent.transmissionState.history.at(-1).childHolobiontId, result.child.holobiontId);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await testTransmission(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont vertical transmission tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont vertical transmission tests failed:', error);
  process.exitCode = 1;
});
