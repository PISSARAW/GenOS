'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'promotion-evidence-test-only';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const authority = require('../src/services/missionEnvelopeAuthority');
const launchAuthority = require('../src/services/missionExecutionAuthority');
const causal = require('../src/services/versionedCausalStateService');
const dossiers = require('../src/services/promotionEvidenceDossierService');
const contract = require('../src/services/promotionEvidenceContract');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function prepare(db) {
  await fixture.workerSchema(db);
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT;
    ALTER TABLE agents ADD COLUMN isolation_mode TEXT;
    ALTER TABLE mission_agents ADD COLUMN role TEXT;
    CREATE TABLE aeis_agent_dissonance (agent_id TEXT PRIMARY KEY, authority_level INTEGER);`);
  const worker = await fixture.addWorker(db);
  await launchAuthority.rotate(db, { missionId: 'worker-mission', agentId: 'parent',
    forceRotate: true });
  return worker;
}

async function authorizedRun(db, contractRecord, workspace) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord,
    missionId: 'worker-mission', budget: { tokens: 100, deterministic: true,
      latencyMs: 300000 } });
  const normalizedMission = { agentId: 'worker', missionId: 'worker-mission',
    workspaceRoot: workspace, workspaceId: 'worker-workspace', toolLease: ['genos_snapshot'],
    timeoutMs: 300000, evidencePolicy: { independentVerifier: true } };
  await authority.seal({ db, agentId: 'worker', executionRun: run,
    executable: process.execPath, contractRecord, autonomyPlan: { mode: 'test' },
    normalizedMission });
  return run;
}

async function replayHistory(db, run) {
  await causal.createRoot(db, { runId: run.id, agentId: 'worker', branchId: 'main',
    snapshotId: 'state-0', purpose: 'promotion baseline', state: { score: 0 } });
  const next = await causal.append(db, { runId: run.id, agentId: 'worker', branchId: 'main',
    expectedHeadId: 'state-0', snapshotId: 'state-1', event: { kind: 'evaluation' },
    state: { score: 1 } });
  return causal.replay(db, { runId: run.id, agentId: 'worker',
    fromSnapshotId: 'state-0', toSnapshotId: next.snapshot.id });
}

function dossierInput(run, replay, id) {
  return { id, runId: run.id, agentId: 'worker', replayReceiptId: replay.id,
    claims: [{ id: 'claim-quality', statement: 'The candidate satisfies the quality target.' }] };
}

async function addPositiveEvidence(db, run, dossierId) {
  for (const verifierId of ['verifier-a', 'verifier-b']) {
    await dossiers.addEvidence(db, { dossierId, runId: run.id, agentId: 'worker',
      claimId: 'claim-quality', kind: 'supporting', status: 'verified',
      sourceRef: `artifact://${verifierId}`, sourceHash: hash(verifierId),
      producerId: 'candidate-worker', verifierId, payload: { score: 1 } });
  }
  await dossiers.addFalsification(db, { dossierId, runId: run.id, agentId: 'worker',
    claimId: 'claim-quality', method: 'Replay with the adverse boundary input.',
    verifierId: 'red-team', outcome: 'survived', counterexample: { found: false } });
}

async function assertEscalation(db, run, replay) {
  await dossiers.open(db, dossierInput(run, replay, 'dossier-technical-success-only'));
  const receipt = await dossiers.seal(db, { dossierId: 'dossier-technical-success-only',
    runId: run.id, agentId: 'worker' });
  assert.equal(receipt.disposition, 'escalate');
  assert.equal(receipt.promotionEligible, false);
  assert.ok(receipt.reasons.includes('claim-quality'));
}

async function assertPromotion(db, run, replay) {
  await dossiers.open(db, dossierInput(run, replay, 'dossier-promote'));
  await addPositiveEvidence(db, run, 'dossier-promote');
  const receipt = await dossiers.seal(db, { dossierId: 'dossier-promote',
    runId: run.id, agentId: 'worker' });
  assert.equal(receipt.disposition, 'promote');
  assert.equal(receipt.authorizesPromotion, false);
  assert.equal(receipt.requiresExistingPromotionGate, true);
  const accepted = await dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    dossierId: 'dossier-promote',
    expectedClaims: [{ statement: 'The candidate satisfies the quality target.' }],
    contract: { promotion: { require_evidence_dossier_v2: true } } });
  assert.equal(accepted.receiptHash, receipt.receiptHash);
  assert.equal(await dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    contract: {} }), null);
  await assert.rejects(db.run(`UPDATE promotion_evidence_dossiers SET disposition = 'reject'
    WHERE id = 'dossier-promote'`), /sealed promotion evidence dossier is immutable/);
}

async function assertRejection(db, run, replay) {
  await dossiers.open(db, dossierInput(run, replay, 'dossier-reject'));
  await addPositiveEvidence(db, run, 'dossier-reject');
  await dossiers.addFalsification(db, { dossierId: 'dossier-reject', runId: run.id,
    agentId: 'worker', claimId: 'claim-quality', method: 'Construct a minimal counterexample.',
    verifierId: 'red-team-2', outcome: 'refuted', counterexample: { input: 'edge-case' } });
  const receipt = await dossiers.seal(db, { dossierId: 'dossier-reject', runId: run.id,
    agentId: 'worker' });
  assert.equal(receipt.disposition, 'reject');
  await assert.rejects(dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    dossierId: 'dossier-reject', expectedClaims: [{ statement:
      'The candidate satisfies the quality target.' }],
    contract: { promotion: { require_evidence_dossier_v2: true } } }),
  { code: 'PROMOTION_EVIDENCE_REJECT' });
}

async function assertQuarantine(db, run, replay) {
  await dossiers.open(db, dossierInput(run, replay, 'dossier-quarantine'));
  await db.run(`INSERT INTO promotion_evidence_items
    (id, dossier_id, claim_id, kind, status, source_ref, source_hash, producer_id,
      verifier_id, independent, payload_json, evidence_hash)
    VALUES ('forged', 'dossier-quarantine', 'claim-quality', 'supporting', 'verified',
      'artifact://forged', ?, 'producer', 'verifier-a', 1, '{}', ?)`,
  hash('forged'), '0'.repeat(64));
  const receipt = await dossiers.seal(db, { dossierId: 'dossier-quarantine',
    runId: run.id, agentId: 'worker' });
  assert.equal(receipt.disposition, 'quarantine');
  assert.ok(receipt.reasons.some((reason) => reason.includes('hash-mismatch')));
}

async function assertFailClosed(db, run, replay) {
  await dossiers.open(db, dossierInput(run, replay, 'dossier-self-verified'));
  await dossiers.addEvidence(db, { dossierId: 'dossier-self-verified', runId: run.id,
    agentId: 'worker', claimId: 'claim-quality', kind: 'supporting', status: 'verified',
    sourceRef: 'artifact://self', sourceHash: hash('self'), producerId: 'worker',
    verifierId: 'worker' });
  const receipt = await dossiers.seal(db, { dossierId: 'dossier-self-verified',
    runId: run.id, agentId: 'worker' });
  assert.equal(receipt.disposition, 'escalate');
  await assert.rejects(dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    dossierId: 'dossier-promote', expectedClaims: [{ statement: 'An unrelated claim.' }],
    contract: { promotion: { require_evidence_dossier_v2: true } } }),
  { code: 'PROMOTION_EVIDENCE_CLAIMS_MISMATCH' });
  await assert.rejects(dossiers.open(db, { ...dossierInput(run, replay, 'wrong-actor'),
    agentId: 'parent' }), { code: 'EXECUTION_AUTHORITY_ACTOR_MISMATCH' });
  await assert.rejects(dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    contract: { promotion: { require_evidence_dossier_v2: true } } }),
  { code: 'PROMOTION_EVIDENCE_DOSSIER_REQUIRED' });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-promotion-evidence-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'input.txt'), 'canonical input');
  const db = openDatabase(path.join(root, 'promotion-evidence.sqlite'));
  try {
    const contractRecord = await prepare(db);
    const run = await authorizedRun(db, contractRecord, workspace);
    const replay = await replayHistory(db, run);
    await assertEscalation(db, run, replay);
    await assertPromotion(db, run, replay);
    await assertRejection(db, run, replay);
    await assertQuarantine(db, run, replay);
    await assertFailClosed(db, run, replay);
    assert.equal(contract.DECISION_SCHEMA, 'genos.promotion-evidence-decision/v1');
    console.log('Promotion evidence: falsification, independence and bounded dispositions passed.');
  } finally {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { main };
