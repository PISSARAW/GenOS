'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'counterfactual-qualification-test-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'counterfactual-receipt-test-only';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const authority = require('../src/services/missionEnvelopeAuthority');
const launchAuthority = require('../src/services/missionExecutionAuthority');
const causal = require('../src/services/versionedCausalStateService');
const qualification = require('../src/services/counterfactualQualificationService');
const dossiers = require('../src/services/promotionEvidenceDossierService');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');

const CLAIM = { id: 'claim-quality',
  statement: 'The candidate remains valid under the declared causal perturbation.' };

async function prepareDatabase(db) {
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
  await authority.seal({ db, agentId: 'worker', executionRun: run,
    executable: process.execPath, contractRecord, autonomyPlan: { mode: 'test' },
    normalizedMission: { agentId: 'worker', missionId: 'worker-mission',
      workspaceRoot: workspace, workspaceId: 'worker-workspace',
      toolLease: ['genos_snapshot'], timeoutMs: 300000,
      evidencePolicy: { independentVerifier: true } } });
  await causal.createRoot(db, { runId: run.id, agentId: 'worker', branchId: 'baseline',
    snapshotId: 'baseline-state', purpose: 'sealed qualification baseline',
    state: { accepted: false, score: 0, input: 'sealed' } });
  return run;
}

function challengeInput(run, suffix, counterfactualState) {
  return { runId: run.id, agentId: 'worker', sourceSnapshotId: 'baseline-state',
    dossierId: `qualification-dossier-${suffix}`, claim: CLAIM,
    candidate: { branchId: `candidate-${suffix}`, forkSnapshotId: `candidate-fork-${suffix}`,
      snapshotId: `candidate-state-${suffix}`, purpose: 'candidate execution',
      intervention: { strategy: 'candidate' }, event: { kind: 'candidate-result' },
      state: { accepted: true, score: 1, input: 'sealed' } },
    counterfactual: { branchId: `counterfactual-${suffix}`,
      forkSnapshotId: `counterfactual-fork-${suffix}`,
      snapshotId: `counterfactual-state-${suffix}`, purpose: 'adverse boundary replay',
      intervention: { input: 'boundary' }, event: { kind: 'causal-perturbation' },
      state: counterfactualState } };
}

function verifierReceipt(challenge, spec) {
  return issueReceipt({ resultId: CLAIM.id, evidenceDigest: challenge.evidenceDigest,
    verifierDigest: trust.ensureVerifier(spec.type).digest,
    status: spec.status || 'verified', independent: true,
    independenceDescriptor: { actorId: spec.actorId,
      workspaceId: `isolated-${spec.actorId}` },
    coveredObligations: [CLAIM.id], evidenceTypes: ['causal-diff', 'replay'] });
}

function receipts(challenge, secondStatus = 'verified') {
  return [verifierReceipt(challenge, { type: 'proof', actorId: 'verifier-proof' }),
    verifierReceipt(challenge, { type: 'counterexample', actorId: 'verifier-counterexample',
      status: secondStatus })];
}

async function assertPromotionCandidate(db, run) {
  const challenge = await qualification.prepare(db, challengeInput(run, 'positive',
    { accepted: true, score: 1, input: 'boundary' }));
  assert.equal(challenge.promotionEligible, false,
    'a technically successful counterfactual preparation is never promotable');
  const result = await qualification.complete(db, { challenge,
    verifierReceipts: receipts(challenge) });
  assert.equal(result.disposition, 'promote');
  assert.equal(result.promotionEligible, true);
  assert.equal(result.authorizesPromotion, false,
    'qualification remains evidence for the existing promotion gate');
  assert.equal(result.decision.authorizesPromotion, false);
  const accepted = await dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    dossierId: challenge.dossierId, expectedClaims: [CLAIM],
    contract: { promotion: { require_evidence_dossier_v2: true } } });
  assert.equal(accepted.receiptHash, result.decisionReceiptHash);
}

async function assertObservableRefusal(db, run) {
  const challenge = await qualification.prepare(db, challengeInput(run, 'refuted',
    { accepted: false, score: -1, input: 'boundary' }));
  const result = await qualification.complete(db, { challenge,
    verifierReceipts: receipts(challenge, 'refuted') });
  assert.equal(result.disposition, 'reject');
  assert.equal(result.promotionEligible, false);
  await assert.rejects(dossiers.assertRequired(db, { runId: run.id, agentId: 'worker',
    dossierId: challenge.dossierId, expectedClaims: [CLAIM],
    contract: { promotion: { require_evidence_dossier_v2: true } } }),
  { code: 'PROMOTION_EVIDENCE_REJECT' });
}

async function assertFailClosed(db, run) {
  const tampered = await qualification.prepare(db, challengeInput(run, 'tampered',
    { accepted: true, score: 1, input: 'boundary' }));
  await assert.rejects(qualification.complete(db, { challenge: { ...tampered,
    diffHash: '0'.repeat(64) }, verifierReceipts: receipts(tampered) }),
  { code: 'COUNTERFACTUAL_QUALIFICATION_CHALLENGE_INVALID' });

  const correlated = await qualification.prepare(db, challengeInput(run, 'correlated',
    { accepted: true, score: 1, input: 'boundary' }));
  const duplicateActor = [verifierReceipt(correlated,
    { type: 'proof', actorId: 'same-verifier' }),
  verifierReceipt(correlated, { type: 'counterexample', actorId: 'same-verifier' })];
  await assert.rejects(qualification.complete(db, { challenge: correlated,
    verifierReceipts: duplicateActor }),
  { code: 'COUNTERFACTUAL_QUALIFICATION_CORRELATED_VERIFIERS' });

  const forged = await qualification.prepare(db, challengeInput(run, 'forged',
    { accepted: true, score: 1, input: 'boundary' }));
  const forgedReceipts = receipts(forged);
  forgedReceipts[0] = { ...forgedReceipts[0], status: 'refuted' };
  await assert.rejects(qualification.complete(db, { challenge: forged,
    verifierReceipts: forgedReceipts }),
  { code: 'COUNTERFACTUAL_QUALIFICATION_RECEIPT_INVALID' });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-counterfactual-qualification-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'input.txt'), 'sealed qualification input');
  const db = openDatabase(path.join(root, 'qualification.sqlite'));
  try {
    const contractRecord = await prepareDatabase(db);
    const run = await authorizedRun(db, contractRecord, workspace);
    await assertPromotionCandidate(db, run);
    await assertObservableRefusal(db, run);
    await assertFailClosed(db, run);
    console.log('Counterfactual mission qualification: signed promotion and refusal passed.');
  } finally {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { main };
