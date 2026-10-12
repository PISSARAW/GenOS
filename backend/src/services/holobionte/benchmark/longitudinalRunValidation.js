'use strict';

const METRICS = Object.freeze([
  'capabilityNeeds', 'residentCapabilitiesReused', 'admissions', 'harmfulAdmissions',
  'immuneFalsePositives', 'verifiedSafeBlocks', 'immuneFalseNegatives',
  'verifiedUnsafeAllows', 'replacementTimeSeconds', 'dependencyConcentration',
  'functionalRedundancy', 'inheritableSymbionts', 'retainedSymbionts',
  'dysbiosisEvents', 'recoveryTimeSeconds'
]);

function invalid(message, code = 'HOLOBIONT_BENCHMARK_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw invalid(`${field} is required.`);
  return normalized;
}

function nonNegative(value, field, allowNull = false) {
  if (allowNull && value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw invalid(`${field} must be non-negative.`);
  return number;
}

function metric(value, key) {
  const number = nonNegative(value, key);
  if (['dependencyConcentration', 'functionalRedundancy'].includes(key) && number > 1) {
    throw invalid(`${key} must be between 0 and 1.`);
  }
  return number;
}

function validateMetrics(metrics = {}) {
  const result = {};
  for (const key of METRICS) {
    const value = nonNegative(metrics[key], key, true);
    if (value !== null) result[key] = metric(value, key);
  }
  return result;
}

function validateRun(run, arm) {
  if (!run || typeof run !== 'object' || typeof run.success !== 'boolean') {
    throw invalid(`${arm} contains a malformed run.`);
  }
  const evidenceRefs = Array.isArray(run.evidenceRefs) ? run.evidenceRefs.map((ref) => String(ref).trim()).filter(Boolean) : [];
  if (!evidenceRefs.length) throw invalid(`${arm} requires run evidence.`, 'HOLOBIONT_EVIDENCE_REQUIRED');
  if (run.runtimeReceipt !== undefined) validateRuntimeReceipt(run, arm);
  return {
    missionId: text(run.missionId, 'missionId'), success: run.success,
    cost: nonNegative(run.cost, 'cost'), tokens: nonNegative(run.tokens, 'tokens'),
    evidenceRefs, verifierId: text(run.verifierId, 'verifierId'), metrics: validateMetrics(run.metrics),
    ...(run.runtimeReceipt ? { runtimeReceipt: run.runtimeReceipt } : {})
  };
}

function receiptIdentity(receipt) {
  return Boolean(receipt && typeof receipt === 'object' && !Array.isArray(receipt)
    && typeof receipt.runId === 'string' && receipt.runId.trim()
    && typeof receipt.executor === 'string' && receipt.executor.trim()
    && ['completed', 'failed'].includes(receipt.status));
}

function receiptEvidence(receipt) {
  return Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0
    && receipt.evidenceRefs.every((ref) => typeof ref === 'string' && ref.trim())
    && typeof receipt.verifierId === 'string' && receipt.verifierId.trim();
}

function receiptMatchesRun(run, receipt) {
  return Boolean(run && Array.isArray(run.evidenceRefs)
    && receipt.evidenceRefs.every((ref) => run.evidenceRefs.includes(ref))
    && receipt.verifierId === run.verifierId
    && receipt.executor !== receipt.verifierId
    && (!run.success || receipt.status === 'completed'));
}

function validateRuntimeReceipt(run, arm) {
  const receipt = run?.runtimeReceipt;
  if (!receiptIdentity(receipt) || !receiptEvidence(receipt)) {
    throw invalid(`${arm} runtime receipt is incomplete.`, 'HOLOBIONT_RUNTIME_RECEIPT_INVALID');
  }
  if (!receiptMatchesRun(run, receipt)) {
    throw invalid(`${arm} runtime receipt does not match run evidence or verifier.`, 'HOLOBIONT_RUNTIME_RECEIPT_MISMATCH');
  }
}

module.exports = { invalid, nonNegative, text, validateRun, validateRuntimeReceipt };
