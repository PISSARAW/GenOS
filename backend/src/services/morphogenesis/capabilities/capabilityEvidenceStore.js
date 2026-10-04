'use strict';

const meristem = require('./epistemicMeristem');
const spiral = require('./unblockSpiral');

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

async function recordAttempt(db, input) {
  if (!input?.attemptId || !input.scopeId) throw new Error('Attempt and scope required');
  const digest = spiral.signature(input.contract);
  await db.run(`INSERT INTO morph_attempts
    (attempt_id, scope_id, signature, contract_json, outcome_ref) VALUES (?, ?, ?, ?, ?)`,
  [input.attemptId, input.scopeId, digest, JSON.stringify(input.contract), input.outcomeRef || null]);
  return { attemptId: input.attemptId, signature: digest };
}

async function loadAttempts(db, scopeId) {
  const rows = await db.all('SELECT contract_json FROM morph_attempts WHERE scope_id = ? ORDER BY created_at, attempt_id', [scopeId]);
  return rows.map((row) => JSON.parse(row.contract_json));
}

module.exports = { recordCoverage, loadCoverage, recordAttempt, loadAttempts };
