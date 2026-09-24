'use strict';

const assert = require('assert');
process.env.GENOS_PROMOTION_SECRET = 'holobiont-host-gate-test-secret';
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const gate = require('../src/services/holobionte/host/hostDecisionGateService');
const signatures = require('../src/services/promotionSignatureService');

async function setup(db) {
  await migrateHolobiontSessions(db);
  const session = await store.createSession(db, { hostId: 'host-decision-gate', missionId: 'mission-gate' });
  const hostConstitution = constitution.createHostConstitution({
    hostId: session.hostId, identity: 'decision-gate-host',
    nonNegotiableInvariants: ['secret-handling']
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  return session.holobiontId;
}

function approvalReceipt() {
  const receipt = {
    decisionId: 'decision-policy-1', resultHash: 'sha256:result-1',
    approvedBy: 'USER', signerId: 'user-reviewer', reason: 'Approved after human review',
    timestamp: Date.now()
  };
  receipt.signature = signatures.generateSignature({
    runId: `${receipt.decisionId}:${receipt.resultHash}`,
    timestamp: receipt.timestamp, signerId: receipt.signerId
  });
  return receipt;
}

function request(holobiontId, expectedSessionRevision, extra = {}) {
  return {
    holobiontId, expectedSessionRevision, requestedAuthority: 'HOST',
    decisionId: 'decision-policy-1',
    claim: 'Host decision after candidate output review.',
    resultHash: 'sha256:result-1', evidenceRefs: ['result:source'],
    riskScore: 0.95, selfVerified: true, ...extra
  };
}

async function testPolicyOverride(db, holobiontId) {
  const denied = await gate.authorizeHostDecision(db, request(holobiontId, 2));
  assert.strictEqual(denied.allowed, false);
  assert.strictEqual(denied.reason, 'POLICY_VETO');
  const allowed = await gate.authorizeHostDecision(db, request(holobiontId, 2, {
    overrideReceipt: approvalReceipt()
  }));
  assert.strictEqual(allowed.allowed, true);
  assert.strictEqual(allowed.overridden, true);
  const restored = await store.getSession(db, holobiontId);
  assert.strictEqual(restored.revision, 3);
  assert.strictEqual(restored.immuneState.overrides[0].approvedBy, 'USER');
}

async function testConstitutionCannotBeOverridden(db, holobiontId) {
  await assert.rejects(() => gate.authorizeHostDecision(db, request(holobiontId, 3, {
    changedInvariants: ['secret-handling'], overrideReceipt: approvalReceipt()
  })), { code: 'HOLOBIONTE_CONSTITUTIONAL_VETO' });
  await assert.rejects(() => gate.authorizeHostDecision(db, request(holobiontId, 3, {
    requestedAuthority: 'SYSTEM'
  })), { code: 'HOLOBIONTE_AUTHORITY_ESCALATION' });
  assert.strictEqual((await store.getSession(db, holobiontId)).revision, 3);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const holobiontId = await setup(db);
    await testPolicyOverride(db, holobiontId);
    await testConstitutionCannotBeOverridden(db, holobiontId);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Host Decision Gate tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Host Decision Gate tests failed:', error);
  process.exitCode = 1;
});
