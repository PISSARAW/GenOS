'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { authorizationPayload } = require('../src/services/shev/authorityService');
const policy = require('../src/services/trajectoryStewardshipPolicyService');
const store = require('../src/services/trajectoryStewardshipStoreService');
const outcomes = require('../src/services/trajectoryStewardshipOutcomeService');

const PROJECT = 'trajectory-outcome-project';
const tenant = { organizationId: 'org-a', projectId: PROJECT };

function sign(privateKey, input) {
  return { ...input, signature: crypto.sign(null,
    Buffer.from(JSON.stringify(authorizationPayload(input))), privateKey).toString('base64') };
}

function decision() {
  return policy.arbitrate({
    agentId: 'agent-steward', mandateRef: 'mandate:product', projectId: PROJECT,
    domains: ['product', 'runtime'],
    trajectory: { objectiveRef: 'objective:retention', observationRef: 'shev:42',
      gap: 0.8, uncertainty: 0.1, learningPotential: 0.4, observationAgeMs: 1000 },
    permissions: { act: true, observe: true, learn: true, explicitWriteLease: true },
    budget: { remainingTokens: 1000 },
    policy: { maxObservationAgeMs: 5000, actThreshold: 0.7,
      uncertaintyThreshold: 0.6, learnThreshold: 0.65,
      actTokens: 500, observeTokens: 100, learnTokens: 250 }
  });
}

function request(responsibility, privateKey, overrides = {}) {
  const base = {
    ...tenant, responsibilityId: responsibility.responsibilityId,
    policyId: 'trajectory-outcome-v1', recordedAt: new Date().toISOString(),
    projectProof: { evidenceRef: 'evidence:project-effect', verifierId: 'project-oracle',
      verdict: 'supported', subjectRef: 'objective:retention' },
    learningProof: { evidenceRef: 'evidence:agent-learning', verifierId: 'learning-oracle',
      verdict: 'supported', subjectRef: 'agent-steward' }
  };
  const value = { ...base, ...overrides,
    projectProof: { ...base.projectProof, ...(overrides.projectProof || {}) },
    learningProof: { ...base.learningProof, ...(overrides.learningProof || {}) } };
  const unsigned = {
    operation: 'trajectory-stewardship-outcome', projectId: PROJECT,
    subjectId: responsibility.responsibilityId, expectedVersion: 1,
    details: { responsibilityId: responsibility.responsibilityId,
      projectEvidenceRef: value.projectProof.evidenceRef,
      learningEvidenceRef: value.learningProof.evidenceRef,
      policyId: value.policyId },
    nonce: `trajectory-outcome-${responsibility.responsibilityId}`,
    expiresAt: new Date(Date.now() + 120000).toISOString()
  };
  return { ...value, authorization: sign(privateKey, unsigned) };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function setup(db, publicKey) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/trajectory-outcome',
    branch: 'codex/trajectory-outcome', objective: 'Mesurer un effet de trajectoire',
    config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:trajectory-owner', authorityPublicKey: publicKey,
    mandate: { purpose: 'Arbitrer la trajectoire sans faux positif',
      autoDiagnose: false, autoInstrument: false,
      dimensions: [{ name: 'effect', expected: 'Effet et apprentissage indépendamment prouvés',
        acceptance: ['Deux oracles distincts attestent les résultats.'] }] } });
}

async function exercise(db, keys) {
  await setup(db, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const opened = await store.openResponsibility(db, { ...tenant, decision: decision(),
    createdAt: '2026-10-19T10:00:00.000Z' });
  const responsibility = opened.receipt;
  const duplicateVerifier = request(responsibility, keys.privateKey,
    { learningProof: { verifierId: 'project-oracle' } });
  await expectCode(outcomes.recordOutcome(db, duplicateVerifier),
    'TRAJECTORY_OUTCOME_PROOFS_NOT_INDEPENDENT');
  const wrongSubject = request(responsibility, keys.privateKey,
    { projectProof: { subjectRef: 'objective:other' } });
  await expectCode(outcomes.recordOutcome(db, wrongSubject), 'TRAJECTORY_OUTCOME_SUBJECT_MISMATCH');

  const authorized = request(responsibility, keys.privateKey);
  const invalid = structuredClone(authorized);
  invalid.authorization.signature = Buffer.alloc(64).toString('base64');
  await assert.rejects(outcomes.recordOutcome(db, invalid), /signature is invalid/);
  const promoted = await outcomes.recordOutcome(db, authorized);
  assert.equal(promoted.receipt.promotionStatus, 'PROMOTED');
  assert.equal((await outcomes.recordOutcome(db, authorized)).replayed, true);
  assert.equal((await outcomes.getOutcome(db, { ...tenant,
    responsibilityId: responsibility.responsibilityId })).receiptId, promoted.receipt.receiptId);
  await assert.rejects(db.run(`UPDATE trajectory_stewardship_outcomes
    SET promotion_status='REJECTED' WHERE responsibility_id=?`, responsibility.responsibilityId),
  /immutable/);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-trajectory-outcome-'));
  const filename = path.join(directory, 'outcome.db');
  const keys = crypto.generateKeyPairSync('ed25519');
  let db = await fixture.memoryDb(filename);
  try {
    await exercise(db, keys);
    await db.close();
    db = await fixture.memoryDb(filename);
    const row = await db.get('SELECT promotion_status FROM trajectory_stewardship_outcomes');
    assert.equal(row.promotion_status, 'PROMOTED', 'double proof must survive restart');
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Trajectory stewardship outcome tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
