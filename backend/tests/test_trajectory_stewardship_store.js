'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const policy = require('../src/services/trajectoryStewardshipPolicyService');
const store = require('../src/services/trajectoryStewardshipStoreService');

const tenant = { organizationId: 'org-a', projectId: 'project-1' };

function decision() {
  return policy.arbitrate({
    agentId: 'agent-steward', mandateRef: 'mandate:product', projectId: 'project-1',
    domains: ['runtime', 'product'],
    trajectory: { objectiveRef: 'objective:retention', observationRef: 'shev:42',
      gap: 0.8, uncertainty: 0.1, learningPotential: 0.4, observationAgeMs: 1000 },
    permissions: { act: true, observe: true, learn: true, explicitWriteLease: true },
    budget: { remainingTokens: 1000 },
    policy: { maxObservationAgeMs: 5000, actThreshold: 0.7,
      uncertaintyThreshold: 0.6, learnThreshold: 0.65,
      actTokens: 500, observeTokens: 100, learnTokens: 250 }
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exercise(db) {
  const input = { ...tenant, decision: decision(), createdAt: '2026-10-19T10:00:00.000Z' };
  const opened = await store.openResponsibility(db, input);
  assert.equal(opened.replayed, false);
  assert.equal(opened.receipt.mode, 'ACT');
  assert.deepEqual(opened.receipt.domains, ['product', 'runtime']);
  assert.equal((await store.openResponsibility(db, input)).replayed, true);
  await expectCode(store.openResponsibility(db, { ...input,
    createdAt: '2026-10-19T10:00:01.000Z' }), 'TRAJECTORY_STEWARDSHIP_IDEMPOTENCY_CONFLICT');

  const restored = await store.getResponsibility(db, { ...tenant,
    responsibilityId: opened.receipt.responsibilityId });
  assert.equal(restored.receiptId, opened.receipt.receiptId);
  assert.equal((await store.listResponsibilities(db, tenant)).length, 1);
  await expectCode(store.getResponsibility(db, { organizationId: 'org-b',
    projectId: 'project-1', responsibilityId: opened.receipt.responsibilityId }),
  'TRAJECTORY_STEWARDSHIP_NOT_FOUND');
  await assert.rejects(db.run(`UPDATE trajectory_stewardship_responsibilities
    SET mode='LEARN' WHERE responsibility_id=?`, opened.receipt.responsibilityId), /immutable/);
  await assert.rejects(db.run(`DELETE FROM trajectory_stewardship_responsibilities
    WHERE responsibility_id=?`, opened.receipt.responsibilityId), /append-only/);

  const noChange = { ...input, decision: { mode: 'NO_CHANGE', candidate: 'ACT',
    reason: 'permission-denied:act', goal: null } };
  await expectCode(store.openResponsibility(db, noChange), 'TRAJECTORY_STEWARDSHIP_NO_ACTION');
  await expectCode(store.openResponsibility(db, { ...input, projectId: 'project-2' }),
    'TRAJECTORY_STEWARDSHIP_SCOPE_MISMATCH');
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-trajectory-stewardship-'));
  const filename = path.join(directory, 'stewardship.db');
  let db = openDatabase(filename);
  try {
    await exercise(db);
    await db.close();
    db = openDatabase(filename);
    const restored = await store.listResponsibilities(db, tenant);
    assert.equal(restored.length, 1, 'responsibility must survive process restart');
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Trajectory stewardship store tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
