'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const sanctions = require('../src/services/holobionte/governance/sanctionService');
const memory = require('../src/services/holobionte/memory/symbioticMemoryService');

async function setup(db) {
  const session = await store.createSession(db, { hostId: 'sanction-host', missionId: 'sanction-mission' });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'sanctions' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 2,
    payload: { symbiontId: 'sanction-target', symbiont: { id: 'sanction-target' } }
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'sanction-target', capabilitiesOffered: ['review'],
      dependencyCeiling: 0.4, resourcesRequested: { tokens: 50 }, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['review'] },
      toolLeases: ['network_fetch', 'read_diff'], dataAccess: ['source'], privacyBoundary: {},
      evidenceRequirements: ['sanction-proof'], expectedBenefit: { quality: 'higher' },
      maxCost: { tokens: 100 }, immunePolicy: {}, adaptationPolicy: {},
      transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['mission-end']
    }
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_ADMITTED', expectedRevision: 3,
    payload: { symbiontId: 'sanction-target', receipt: { receiptId: 'target-admission' } }
  });
  return store.getSession(db, session.holobiontId);
}

function sanctionInput(session, action) {
  return {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    symbiontId: 'sanction-target', action, reason: 'unverified external request',
    duration: 'until-review', recoveryConditions: ['new verified review'],
    evidenceRefs: ['proof:external-request'], verifierId: 'host-verifier'
  };
}

async function testGraduatedSanctions(db) {
  const session = await setup(db);
  const warned = await sanctions.sanctionSymbiont(db, sanctionInput(session, 'WARN'));
  assert.strictEqual(warned.applied, true);
  const toolRevoked = await sanctions.sanctionSymbiont(db, {
    ...sanctionInput(session, 'REVOKE_TOOL'), toolName: 'network_fetch'
  });
  assert.strictEqual(toolRevoked.result.revision, 2);
  assert.deepStrictEqual(toolRevoked.result.toolLeases, ['read_diff']);
  const current = await store.getSession(db, session.holobiontId);
  const dormant = await sanctions.sanctionSymbiont(db, sanctionInput(current, 'DORMANT'));
  assert.strictEqual(dormant.applied, true);
  assert.strictEqual((await store.getSession(db, session.holobiontId)).residentSymbionts[0].status, 'DORMANT');
  const memories = await memory.recallMemories(db, { holobiontId: session.holobiontId, memoryType: 'PARTNER_REPUTATION' });
  assert.strictEqual(memories.length, 3);
}

async function testExpulsionApproval(db) {
  const session = await setup(db);
  await assert.rejects(() => sanctions.sanctionSymbiont(db, {
    ...sanctionInput(session, 'EXPEL')
  }), { code: 'HOLOBIONT_EXPULSION_APPROVAL_REQUIRED' });
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await migrateHolobiontMemory(db);
    await testGraduatedSanctions(db);
    await testExpulsionApproval(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont sanction tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont sanction tests failed:', error);
  process.exitCode = 1;
});
