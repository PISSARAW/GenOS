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
const memory = require('../src/services/holobionte/memory/symbioticMemoryService');
const transfer = require('../src/services/holobionte/transmission/controlledProcedureTransferService');

async function createHost(db, hostId) {
  const session = await store.createSession(db, { hostId, missionId: `mission-${hostId}` });
  const hostConstitution = constitution.createHostConstitution({ hostId, identity: hostId });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  return store.getSession(db, session.holobiontId);
}

async function createDonor(db) {
  const donor = await createHost(db, 'procedure-donor');
  await store.appendEvent(db, {
    holobiontId: donor.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: donor.revision,
    payload: { symbiontId: 'pdf-specialist', symbiont: { id: 'pdf-specialist' } }
  });
  await contracts.createContract(db, {
    holobiontId: donor.holobiontId, expectedSessionRevision: donor.revision + 1,
    contract: {
      hostId: donor.hostId, symbiontId: 'pdf-specialist', capabilitiesOffered: ['parse_pdf'],
      dependencyCeiling: 0.3, resourcesRequested: {}, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['parse_pdf'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['procedure-proof'], expectedBenefit: { accuracy: 'higher' },
      maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['procedure-revoked']
    }
  });
  await store.appendEvent(db, {
    holobiontId: donor.holobiontId, eventType: 'SYMBIONT_ADMITTED',
    expectedRevision: donor.revision + 1, payload: { symbiontId: 'pdf-specialist', receipt: { receiptId: 'donor-admission' } }
  });
  const procedure = { capability: 'parse_pdf', steps: [{ operation: 'extract_text' }] };
  const current = await store.getSession(db, donor.holobiontId);
  await memory.recordMemory(db, {
    holobiontId: current.holobiontId, expectedSessionRevision: current.revision,
    memoryType: 'PROCEDURAL', content: {
      procedureId: 'pdf-text-v1', producerSymbiontId: 'pdf-specialist', procedure
    }, procedureVerified: true, evidenceRefs: ['proof:donor-validated-procedure'], authorId: 'donor-host'
  });
  const procedures = await memory.recallMemories(db, { holobiontId: current.holobiontId, memoryType: 'PROCEDURAL' });
  return { session: current, memory: procedures[0], procedure };
}

async function testVerifiedTransfer(db) {
  const donor = await createDonor(db);
  const recipient = await createHost(db, 'procedure-recipient');
  const result = await transfer.transferProcedure(db, {
    donorHolobiontId: donor.session.holobiontId,
    recipientHolobiontId: recipient.holobiontId,
    expectedRecipientRevision: recipient.revision,
    donorSymbiontId: 'pdf-specialist', procedureMemoryId: donor.memory.memoryId,
    capability: 'parse_pdf', verifierId: 'recipient-verifier',
    sandboxReceipt: { isolated: true, passed: true,
      procedureHash: transfer.digest(donor.procedure), evidenceRefs: ['proof:recipient-sandbox'] }
  });
  assert.strictEqual(result.assimilated, true);
  const received = await memory.recallMemories(db, {
    holobiontId: recipient.holobiontId, memoryType: 'PROCEDURAL'
  });
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].content.transfer.sourceHostId, donor.session.hostId);
}

async function testSandboxGate(db) {
  const donor = await createDonor(db);
  const recipient = await createHost(db, 'procedure-rejected-recipient');
  await assert.rejects(() => transfer.transferProcedure(db, {
    donorHolobiontId: donor.session.holobiontId,
    recipientHolobiontId: recipient.holobiontId,
    expectedRecipientRevision: recipient.revision,
    donorSymbiontId: 'pdf-specialist', procedureMemoryId: donor.memory.memoryId,
    capability: 'parse_pdf', sandboxReceipt: { isolated: false, passed: true }
  }), { code: 'HOLOBIONT_PROCEDURE_SANDBOX_REQUIRED' });
  assert.strictEqual((await memory.recallMemories(db, {
    holobiontId: recipient.holobiontId, memoryType: 'PROCEDURAL'
  })).length, 0);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await migrateHolobiontMemory(db);
    await testVerifiedTransfer(db);
    await testSandboxGate(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont procedure transfer tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont procedure transfer tests failed:', error);
  process.exitCode = 1;
});
