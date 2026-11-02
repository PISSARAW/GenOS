'use strict';

const { digest, fail } = require('./qualityContract');
const integrity = require('./qualityReceiptIntegrity');
const receiptStore = require('./qualityReceiptStore');
const authority = require('../missionEnvelopeAuthority');

async function finalWorker(input) {
  const member = input.plan.members.find(item => item.memberId === input.run.finalArtifactMemberId);
  const verdict = input.observed.verdicts.get(member?.workerId);
  if (!member || !verdict?.promoted || input.observed.statuses.get(member.workerId) !== 'completed') {
    throw fail('GQEL_FINAL_ARTIFACT_MISSING', 'The canonical final integration member did not deliver a verified artifact.');
  }
  if (!verdict.report?.workerArtifact?.content) throw fail('GQEL_FINAL_ARTIFACT_MISSING', 'A final typed artifact is required; reports cannot be concatenated into a deliverable.');
  const agent = await input.db.get('SELECT metadata_json FROM agents WHERE id=?', member.workerId);
  const metadata = JSON.parse(agent?.metadata_json || '{}');
  const worker = { agentId: member.workerId, workerContract: metadata.workerContract };
  if (worker.workerContract?.qualityElevation?.digest !== input.run.qualityElevation.digest) {
    throw fail('GQEL_CONTRACT_CHANGED', 'The final integration worker does not carry the collective quality contract.');
  }
  const dossier = input.observed.dossiers.find(item => item.workerId === member.workerId);
  const scoped = require('./qualityValidationScope').workerScope(worker, dossier || {}, verdict.report);
  if (!scoped.executionRunId) throw fail('GQEL_RECEIPT_SCOPE_REQUIRED', 'Final artifact proof needs its independently observed execution run.');
  const latest = await input.db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', member.workerId);
  if (latest?.id !== scoped.executionRunId) throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Final artifact belongs to a superseded worker attempt.');
  return { member, report: verdict.report, worker: scoped };
}

async function verifiedFinalReceipt(input, target) {
  const runId = target.worker.executionRunId;
  const saved = await receiptStore.get(input.db, { runId, contractDigest: input.run.qualityElevation.digest });
  if (!saved || digest(saved.receipt) !== digest(target.report.qualityElevationReceipt)) {
    throw fail('GQEL_RECEIPT_MISSING', 'The delivered final artifact needs its persisted native quality receipt.');
  }
  const current = await authority.assertRun(input.db, { agentId: target.worker.agentId, runId });
  assertCollectiveScope(input.run, current.envelope);
  await authority.assertCompletedRunEvidence(input.db, { agentId: target.worker.agentId, runId });
  const text = require('./workerQualityContractEnforcer').extractTargetContent(target.report, target.report.workerArtifact);
  integrity.assertReceipt(saved.receipt, { text, artifact: target.report.workerArtifact, worker: { ...target.worker,
    missionId: current.envelope.missionId, executionAuthorityRef: { hash: current.hash } } });
  return { ...saved, text };
}

function assertCollectiveScope(run, envelope) {
  const formedAt = Date.parse(run.createdAt), sealedAt = Date.parse(envelope.issuedAt);
  if (envelope.orchestratorId !== run.missionId || !Number.isFinite(formedAt)
    || !Number.isFinite(sealedAt) || sealedAt < formedAt
    || envelope.qualityElevation?.contractId !== run.qualityElevation.contractId
    || envelope.qualityElevation?.runtimeDigest !== digest(run.qualityRuntime || {})) {
    throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Final artifact execution was not sealed for this collective formation and orchestrator.');
  }
}

function finalRecord(input, target, saved) {
  return integrity.sign({ schema: 'genos.gqel-final-artifact/v1', teamRunId: input.run.teamRunId,
    missionId: input.run.missionId, memberId: target.member.memberId,
    workerId: target.worker.agentId, executionRunId: target.worker.executionRunId,
    contractDigest: input.run.qualityElevation.digest, artifactDigest: digest(saved.text),
    artifact: structuredClone(target.report.workerArtifact), qualityReceiptId: saved.receipt.receiptId,
    qualityReceiptDigest: digest(saved.receipt), reviewedArtifactDigest: saved.receipt.reviewedArtifactDigest,
    qualitySatisfied: true, authorizesMissionPromotion: false });
}

async function persistFinalRecord(db, record) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gqel_final_artifacts (
    team_run_id TEXT PRIMARY KEY, artifact_digest TEXT NOT NULL, record_json TEXT NOT NULL);`);
  const encoded = integrity.encode(record);
  await db.run('INSERT OR IGNORE INTO gqel_final_artifacts VALUES (?, ?, ?)', record.teamRunId, record.artifactDigest, encoded);
  const row = await db.get('SELECT * FROM gqel_final_artifacts WHERE team_run_id=?', record.teamRunId);
  if (row?.record_json !== encoded || row.artifact_digest !== record.artifactDigest) {
    throw fail('GQEL_FINAL_ARTIFACT_CONFLICT', 'The collective run already identifies a different final artifact.');
  }
  return record;
}

async function qualifyFinalArtifact(input) {
  if (!input.run.qualityElevation) return { required: false, passed: true };
  try {
    const target = await finalWorker(input), saved = await verifiedFinalReceipt(input, target);
    const artifact = await persistFinalRecord(input.db, finalRecord(input, target, saved));
    return { required: true, passed: true, artifact };
  } catch (error) {
    return { required: true, passed: false, reason: error.code || 'GQEL_FINAL_ARTIFACT_UNVERIFIED', message: error.message };
  }
}

function finalQualityInvariant(input) {
  if (!input.run.qualityElevation) return [];
  const record = input.finalQuality?.artifact;
  const passed = integrity.authenticated(record) && record.schema === 'genos.gqel-final-artifact/v1'
    && record.teamRunId === input.run.teamRunId && record.contractDigest === input.run.qualityElevation.digest
    && record.memberId === input.run.finalArtifactMemberId && record.qualitySatisfied === true;
  return [{ id: 'final_artifact_quality_satisfied', passed }];
}

module.exports = { qualifyFinalArtifact, finalQualityInvariant };
