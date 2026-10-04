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
  if (!await input.resolveArtifact(input.verificationRef)) {
    throw new Error('Coverage verification is unresolved');
  }
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
    if ((await Promise.all(refs.map(input.resolveArtifact))).every(Boolean)) active.push(receipt);
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
  const rows = await db.all('SELECT contract_json FROM morph_attempts WHERE scope_id = ? ORDER BY created_at, attempt_id', [scopeId]);
  return rows.map((row) => JSON.parse(row.contract_json));
}

module.exports = { recordCoverage, loadCoverage, loadVerifiedCoverage, recordAttempt, loadAttempts };
