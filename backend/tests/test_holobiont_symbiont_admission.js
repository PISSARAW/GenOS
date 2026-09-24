'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const admission = require('../src/services/holobionte/symbionts/symbiontAdmissionService');

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  const session = await store.createSession(db, { hostId: 'host-admission', missionId: 'mission-admission' });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 1,
    payload: { symbiontId: 'candidate-admission', symbiont: { role: 'reviewer' } }
  });
  const hostConstitution = constitution.createHostConstitution({
    hostId: session.hostId, identity: 'admission-host', privacyPolicy: { restricted: ['secrets'] }
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 2
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'candidate-admission', capabilitiesOffered: ['review'],
      resourcesRequested: {}, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['review'] }, toolLeases: ['read_diff'],
      dataAccess: ['diff'], privacyBoundary: {}, evidenceRequirements: ['citations'],
      expectedBenefit: { quality: 'higher' }, maxCost: { tokens: 100 }, immunePolicy: {},
      adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['done'],
      dependencyCeiling: 0.4
    }
  });
  return session.holobiontId;
}

async function testRestrictedTrialAndAdmission(db, holobiontId) {
  const trial = await admission.startAdmission(db, {
    holobiontId, symbiontId: 'candidate-admission', capability: 'review',
    toolName: 'read_diff', dataAccess: ['diff'], expectedSessionRevision: 3
  });
  assert.strictEqual(trial.status, 'TRIAL');
  assert.strictEqual(trial.sandbox.capability, 'review');
  assert.deepStrictEqual(trial.sandbox.toolLeases, ['read_diff']);
  assert.deepStrictEqual(trial.sandbox.dataAccess, ['diff']);
  assert.deepStrictEqual(trial.sandbox.maxCost, { tokens: 20 });
  const session = await store.getSession(db, holobiontId);
  assert.strictEqual(session.candidateSymbionts[0].status, 'TRIAL');
  assert.strictEqual(session.candidateSymbionts[0].admissionTrial.capability, 'review');
  const result = await admission.evaluateTrial(db, {
    holobiontId, symbiontId: 'candidate-admission', expectedSessionRevision: 4,
    contributionScore: 0.9, evidenceRefs: ['sha256:review-result'], contractCompliant: true
  });
  assert.strictEqual(result.decision, 'ADMITTED');
  const restored = await store.getSession(db, holobiontId);
  assert.strictEqual(restored.residentSymbionts[0].id, 'candidate-admission');
  assert.strictEqual(restored.residentSymbionts[0].admissionReceipt.receiptId, result.receipt.receiptId);
  assert.strictEqual(restored.residentSymbionts[0].admissionReceipt.immuneReview.allowed, true);
}

async function testTrialRejectionAndBounds(db, holobiontId) {
  await store.appendEvent(db, {
    holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 5,
    payload: { symbiontId: 'candidate-weak', symbiont: { role: 'reviewer' } }
  });
  const session = await store.getSession(db, holobiontId);
  await contracts.createContract(db, {
    holobiontId, expectedSessionRevision: session.revision,
    contract: {
      hostId: session.hostId, symbiontId: 'candidate-weak', capabilitiesOffered: ['review'],
      resourcesRequested: {}, inputs: {}, outputs: {},
      authorityScope: { level: 'LOCAL', actions: ['review'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['citations'], expectedBenefit: { quality: 'higher' },
      maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['done'], dependencyCeiling: 0.4
    }
  });
  await assert.rejects(() => admission.startAdmission(db, {
    holobiontId, symbiontId: 'candidate-weak', capability: 'deploy',
    expectedSessionRevision: session.revision
  }), { code: 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE' });
  await admission.startAdmission(db, {
    holobiontId, symbiontId: 'candidate-weak', capability: 'review',
    expectedSessionRevision: session.revision
  });
  const trial = await store.getSession(db, holobiontId);
  await assert.rejects(() => admission.evaluateTrial(db, {
    holobiontId, symbiontId: 'candidate-weak', expectedSessionRevision: trial.revision,
    contributionScore: 0.1, evidenceRefs: [], contractCompliant: true
  }), { code: 'HOLOBIONT_TRIAL_EVIDENCE_REQUIRED' });
  const rejected = await admission.evaluateTrial(db, {
    holobiontId, symbiontId: 'candidate-weak', expectedSessionRevision: trial.revision,
    contributionScore: 0.1, evidenceRefs: ['sha256:no-useful-output'], contractCompliant: true
  });
  assert.strictEqual(rejected.decision, 'REJECTED');
  assert.strictEqual((await store.getSession(db, holobiontId)).candidateSymbionts.length, 0);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const holobiontId = await setup(db);
    await testRestrictedTrialAndAdmission(db, holobiontId);
    await testTrialRejectionAndBounds(db, holobiontId);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Symbiont admission tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Symbiont admission tests failed:', error);
  process.exitCode = 1;
});
