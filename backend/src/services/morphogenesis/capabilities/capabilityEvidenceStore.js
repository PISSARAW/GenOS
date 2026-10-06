'use strict';

const meristem = require('./epistemicMeristem');
const spiral = require('./unblockSpiral');
const { withTransaction } = require('../../../db');

async function recordCoverage(db, input) {
  const experiment = meristem.experiment(input.experiment);
  if (!input.receiptId || !input.scopeId || input.status !== 'VERIFIED'
    || input.verifierId !== experiment.verifierId
    || !input.verificationRef || typeof input.resolveArtifact !== 'function'
    || !Array.isArray(input.evidenceRefs) || !input.evidenceRefs.length) {
    throw new Error('Verified scoped coverage receipt required');
  }
  if (!(await Promise.all([input.verificationRef, ...input.evidenceRefs].map(input.resolveArtifact))).every(Boolean)) {
    throw new Error('Coverage verification is unresolved');
  }
  await requireCoverageBinding({ ...input, experiment });
  await db.run(`INSERT INTO morph_experiment_coverage
    (receipt_id, scope_id, experiment_json, verifier_id, verification_ref, evidence_refs_json, status)
    VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED')`,
  [input.receiptId, input.scopeId, JSON.stringify(experiment), input.verifierId, input.verificationRef,
    JSON.stringify(input.evidenceRefs)]);
  return { receiptId: input.receiptId, status: 'VERIFIED' };
}

async function loadCoverage(db, scopeId) {
  const rows = await db.all(`SELECT * FROM morph_experiment_coverage
    WHERE scope_id = ? AND status = 'VERIFIED' ORDER BY created_at`, [scopeId]);
  return rows.map((row) => ({ status: row.status, verifierId: row.verifier_id,
    verificationRef: row.verification_ref, evidenceRefs: JSON.parse(row.evidence_refs_json),
    experiment: JSON.parse(row.experiment_json) }));
}

async function loadVerifiedCoverage(db, input) {
  if (!input?.scopeId || typeof input.resolveArtifact !== 'function') {
    throw new Error('Coverage scope and artifact resolver are required');
  }
  const receipts = await loadCoverage(db, input.scopeId);
  const active = [];
  for (const receipt of receipts) {
    const refs = [receipt.verificationRef, ...receipt.evidenceRefs];
    if (!(await Promise.all(refs.map(input.resolveArtifact))).every(Boolean)) continue;
    try { await requireCoverageBinding({ ...receipt, resolveArtifact: input.resolveArtifact }); active.push(receipt); }
    catch (_) { /* inaccessible or unbound evidence does not cover a niche */ }
  }
  return active;
}

function outcomeStatus(input) {
  const status = input.contract?.outcomeStatus || 'UNVERIFIED';
  if (!['UNVERIFIED', 'VERIFIED_FAILURE', 'VERIFIED_SUCCESS'].includes(status)) {
    throw new Error('Invalid attempt outcome status');
  }
  return status;
}

async function requireAttemptProof(input) {
  const status = outcomeStatus(input);
  if (status === 'UNVERIFIED') return;
  if (!input.outcomeRef || typeof input.resolveArtifact !== 'function'
    || !await input.resolveArtifact(input.outcomeRef)) {
    throw new Error('Verified attempt outcome must resolve');
  }
}

async function recordAttempt(db, input) {
  if (!input?.attemptId || !input.scopeId) throw new Error('Attempt and scope required');
  const digest = spiral.signature(input.contract);
  await requireAttemptProof(input);
  return withTransaction(db, async (tx) => {
    const attempts = await loadAttempts(tx, input.scopeId);
    const decision = spiral.planNext({ attempts, candidates: [input.contract] });
    if (!decision.permitted) throw new Error('ATTEMPT_NOT_DISTINCT');
    await tx.run(`INSERT INTO morph_attempts
      (attempt_id, scope_id, signature, contract_json, outcome_ref) VALUES (?, ?, ?, ?, ?)`,
    [input.attemptId, input.scopeId, digest, JSON.stringify(input.contract), input.outcomeRef || null]);
    return { attemptId: input.attemptId, signature: digest, outcomeStatus: outcomeStatus(input) };
  });
}

async function loadAttempts(db, scopeId) {
  const rows = await db.all('SELECT attempt_id, contract_json, outcome_ref FROM morph_attempts WHERE scope_id = ? ORDER BY rowid', [scopeId]);
  return rows.map((row) => ({ ...JSON.parse(row.contract_json), attemptId: row.attempt_id, outcomeRef: row.outcome_ref }));
}

async function finalizeAttempt(db, input) {
  await requireAttemptProof(input);
  if (outcomeStatus(input) === 'UNVERIFIED') throw new Error('VERIFIED_OUTCOME_REQUIRED');
  return withTransaction(db, async (tx) => {
    const row = await tx.get('SELECT * FROM morph_attempts WHERE attempt_id = ? AND scope_id = ?', [input.attemptId, input.scopeId]);
    if (!row) throw new Error('ATTEMPT_NOT_FOUND');
    const previous = JSON.parse(row.contract_json);
    const status = outcomeStatus(input);
    if (previous.outcomeStatus && previous.outcomeStatus !== 'UNVERIFIED') {
      if (previous.outcomeStatus !== status || row.outcome_ref !== input.outcomeRef) throw new Error('ATTEMPT_OUTCOME_CONFLICT');
      return { attemptId: input.attemptId, outcomeStatus: status, idempotent: true };
    }
    await tx.run('UPDATE morph_attempts SET contract_json = ?, outcome_ref = ? WHERE attempt_id = ?',
      [JSON.stringify({ ...previous, outcomeStatus: status }), input.outcomeRef, input.attemptId]);
    return { attemptId: input.attemptId, outcomeStatus: status };
  });
}

module.exports = { recordCoverage, loadCoverage, loadVerifiedCoverage, recordAttempt, loadAttempts, finalizeAttempt };

async function requireCoverageBinding(input) {
  const proof = await input.resolveArtifact(input.verificationRef);
  const content = proof?.content;
  if (proof?.kind !== 'experiment-verification' || content?.valid !== true
    || content.experimentId !== input.experiment.experimentId || content.verifierId !== input.verifierId) {
    throw new Error('COVERAGE_VERIFICATION_BINDING_INVALID');
  }
  if (!input.experiment.discriminatingOutcomes.includes(content.outcome)
    || JSON.stringify(content.evidenceRefs) !== JSON.stringify(input.evidenceRefs)) throw new Error('COVERAGE_EVIDENCE_BINDING_INVALID');
}
