'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontLedger } = require('../src/db/migrations/migrateHolobiontLedger');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const admission = require('../src/services/holobionte/symbionts/symbiontAdmissionService');
const ledger = require('../src/services/holobionte/fitness/symbiontContributionService');

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  await migrateHolobiontLedger(db);
  const session = await store.createSession(db, { hostId: 'host-ledger', missionId: 'mission-ledger' });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 1,
    payload: { symbiontId: 'sym-ledger' }
  });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'ledger-host' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 2
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'sym-ledger', capabilitiesOffered: ['analyze'],
      resourcesRequested: {}, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['analyze'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['result'], expectedBenefit: { quality: 'higher' },
      maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['done'], dependencyCeiling: 0.4
    }
  });
  await admission.startAdmission(db, {
    holobiontId: session.holobiontId, symbiontId: 'sym-ledger', capability: 'analyze',
    expectedSessionRevision: 3
  });
  await admission.evaluateTrial(db, {
    holobiontId: session.holobiontId, symbiontId: 'sym-ledger', expectedSessionRevision: 4,
    contributionScore: 0.8, evidenceRefs: ['result:trial'], contractCompliant: true
  });
  return session.holobiontId;
}

function contributionInput(holobiontId, expectedSessionRevision) {
  return {
    holobiontId, symbiontId: 'sym-ledger', capability: 'analyze', expectedSessionRevision,
    receiptId: 'receipt-ledger-001', benefitScore: 0.9, evidenceQuality: 0.8,
    costScore: 0.2, riskScore: 0.1, resourcesConsumed: { tokens: 35 },
    hostInterventions: 1, failures: 0, falseAlerts: 0,
    verification: {
      status: 'VERIFIED', verifierId: 'evidence-gate', resultHash: 'sha256:completed-output',
      evidenceRefs: ['result:sha256:verified-output']
    }
  };
}

async function testVerifiedLedger(db, holobiontId) {
  const session = await store.getSession(db, holobiontId);
  const record = await ledger.recordContribution(db, contributionInput(holobiontId, session.revision));
  assert.strictEqual(record.contributionScore, 0.72);
  const records = await ledger.relationshipLedger(db, holobiontId, 'sym-ledger');
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].resourcesConsumed.tokens, 35);
  assert.strictEqual(ledger.relationshipFitness(records).classification, 'MUTUALISTIC');
  const afterWrite = await store.getSession(db, holobiontId);
  assert.strictEqual(afterWrite.verifiedContributions.length, 1);
  await assert.rejects(() => ledger.recordContribution(db, contributionInput(holobiontId, afterWrite.revision)));
  assert.strictEqual((await store.getSession(db, holobiontId)).revision, afterWrite.revision);
  await assert.rejects(() => db.run('UPDATE holobiont_symbiosis_ledger SET cost_score = 1 WHERE receipt_id = ?', record.receiptId));
  await assert.rejects(() => db.run('DELETE FROM holobiont_symbiosis_ledger WHERE receipt_id = ?', record.receiptId));
}

async function testEvidenceGate(db, holobiontId) {
  const session = await store.getSession(db, holobiontId);
  const input = contributionInput(holobiontId, session.revision);
  input.verification.evidenceRefs = ['unrelated:artifact'];
  await assert.rejects(() => ledger.recordContribution(db, input), { code: 'HOLOBIONT_EVIDENCE_INCOMPLETE' });
  input.verification.evidenceRefs = [];
  await assert.rejects(() => ledger.recordContribution(db, input), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  assert.strictEqual((await store.getSession(db, holobiontId)).revision, session.revision);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const holobiontId = await setup(db);
    await testVerifiedLedger(db, holobiontId);
    await testEvidenceGate(db, holobiontId);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Symbiosis Ledger tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Symbiosis Ledger tests failed:', error);
  process.exitCode = 1;
});
