'use strict';

/**
 * oracleScientificValidityService.js
 *
 * Garde-fous pour combler l'écart entre la vérification cryptographique
 * (provenance/intégrité d'une attestation) et son exactitude scientifique
 * (le vérificateur a réellement testé l'hypothèse dans le monde réel ou simulé).
 */

const HEX_DIGEST = /^[a-f0-9]{32,128}$/i;
const WORLDS = new Set(['real', 'simulated']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function normalizeErrors(errors) {
  return [...new Set(errors.filter(isNonEmptyString))];
}

function hasValidDigest(value) {
  return isNonEmptyString(value) && HEX_DIGEST.test(value);
}

function digestOf(descriptor) {
  return descriptor.hash || descriptor.digest;
}

function checkDescriptorFields(descriptor, errors, options) {
  if (!isNonEmptyString(descriptor.id)) errors.push('oracle_id_missing');
  if (!isNonEmptyString(descriptor.version)) errors.push('oracle_version_missing');
  if (!hasValidDigest(digestOf(descriptor))) errors.push('oracle_hash_invalid');
}

function checkDescriptorWorld(descriptor, errors, options) {
  if (descriptor.world !== undefined && !WORLDS.has(descriptor.world)) {
    errors.push('oracle_world_invalid');
  }
  const expectedWorld = options.expectedWorld;
  if (isNonEmptyString(expectedWorld) && descriptor.world && descriptor.world !== expectedWorld) {
    errors.push('oracle_world_mismatch');
  }
}

function checkDescriptorScope(descriptor, errors) {
  if (descriptor.scope === undefined) return;
  const scopeOk = isNonEmptyString(descriptor.scope)
    || (Array.isArray(descriptor.scope) && descriptor.scope.length > 0);
  if (!scopeOk) errors.push('oracle_scope_invalid');
}

function checkDescriptorSource(descriptor, errors, options) {
  if (options.requireExternal === true && descriptor.source !== 'external') {
    errors.push('oracle_not_external');
  }
}

function validateOracleDescriptor(descriptor, options = {}) {
  if (!isPlainObject(descriptor)) {
    return { valid: false, errors: ['oracle_descriptor_missing'], score: 0 };
  }
  const errors = [];
  checkDescriptorFields(descriptor, errors, options);
  checkDescriptorWorld(descriptor, errors, options);
  checkDescriptorScope(descriptor, errors);
  checkDescriptorSource(descriptor, errors, options);
  const uniqueErrors = normalizeErrors(errors);
  const score = uniqueErrors.length === 0 ? 100 : clampScore(100 - uniqueErrors.length * 25);
  return { valid: uniqueErrors.length === 0, errors: uniqueErrors, score };
}

function hasCommand(execution) {
  return isNonEmptyString(execution.command) || isNonEmptyString(execution.procedure);
}

function hasOutcome(execution) {
  return Number.isInteger(execution.exitCode) || isNonEmptyString(execution.status);
}

function hasTiming(execution) {
  return Number.isFinite(execution.durationMs) && execution.durationMs >= 0;
}

function hasEnvironment(execution) {
  return isNonEmptyString(execution.environmentHash)
    || isNonEmptyString(execution.sandboxId)
    || isNonEmptyString(execution.processId);
}

function executionHasEvidence(execution) {
  if (!isPlainObject(execution)) return false;
  if (!hasCommand(execution)) return false;
  if (!hasOutcome(execution)) return false;
  if (!hasTiming(execution)) return false;
  if (!hasEnvironment(execution)) return false;
  const oracle = validateOracleDescriptor(execution.oracle, {});
  return oracle.valid;
}

function countValidExecutions(executions) {
  let count = 0;
  for (const execution of executions) {
    if (executionHasEvidence(execution)) count += 1;
  }
  return count;
}

function checkExecutionCount(executions, minExecutions, errors) {
  if (executions.length < minExecutions) errors.push('insufficient_executions');
}

function checkVerifierTrust(receipt, trusted, errors) {
  if (trusted.length > 0 && !trusted.includes(receipt.verifierDigest)) {
    errors.push('verifier_not_trusted');
  }
}

function checkWorldConsistency(executions, expectedWorld, errors) {
  if (!expectedWorld) return;
  const mismatch = executions.some((execution) => {
    const oracle = execution && execution.oracle;
    return oracle && oracle.world && oracle.world !== expectedWorld;
  });
  if (mismatch) errors.push('world_mismatch');
}

function checkReceiptAge(receipt, maxAgeMs, errors) {
  if (maxAgeMs === null) return;
  const checkedAt = Date.parse(receipt.checkedAt);
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > maxAgeMs) {
    errors.push('receipt_stale');
  }
}

function checkExecutionQuality(spec) {
  const { validExecutions, executions, minExecutions, errors } = spec;
  if (validExecutions < minExecutions) errors.push('no_verified_execution');
  if (validExecutions < executions.length) errors.push('execution_evidence_incomplete');
}

function validateReceiptScientificValidity(receipt, options = {}) {
  if (!isPlainObject(receipt)) {
    return { valid: false, errors: ['receipt_missing'], score: 0, executionCount: 0, validExecutionCount: 0 };
  }
  const executions = Array.isArray(receipt.executionEvidence) ? receipt.executionEvidence : [];
  const minExecutions = Number.isInteger(options.minExecutions) && options.minExecutions > 0
    ? options.minExecutions : 1;
  const errors = [];
  checkExecutionCount(executions, minExecutions, errors);
  if (executions.length === 0) {
    return { valid: false, errors: normalizeErrors(errors), score: 0, executionCount: 0, validExecutionCount: 0 };
  }
  const validExecutions = countValidExecutions(executions);
  checkExecutionQuality({ validExecutions, executions, minExecutions, errors });
  const trusted = Array.isArray(options.trustedVerifierDigests) ? options.trustedVerifierDigests : [];
  checkVerifierTrust(receipt, trusted, errors);
  checkWorldConsistency(executions, options.expectedWorld, errors);
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : null;
  checkReceiptAge(receipt, maxAgeMs, errors);
  const uniqueErrors = normalizeErrors(errors);
  const ratio = executions.length ? validExecutions / executions.length : 0;
  const score = clampScore(ratio * 100 - uniqueErrors.length * 10);
  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    score,
    executionCount: executions.length,
    validExecutionCount: validExecutions,
  };
}

function collectDistinctVerifiers(receipts) {
  const distinct = new Set();
  for (const receipt of receipts) {
    if (receipt && isNonEmptyString(receipt.verifierDigest)) distinct.add(receipt.verifierDigest);
  }
  return distinct;
}

function checkVerifierCount(distinct, minDistinct, issues) {
  if (distinct.size < minDistinct) issues.push('insufficient_independent_verifiers');
}

function checkClaimantEquality(distinct, claimantDigest, issues) {
  if (isNonEmptyString(claimantDigest) && distinct.has(claimantDigest)) {
    issues.push('verifier_equals_claimant');
  }
}

function checkOracleArtifactReuse(receipts, claimantArtifacts, issues) {
  for (const receipt of receipts) {
    const executions = Array.isArray(receipt?.executionEvidence) ? receipt.executionEvidence : [];
    for (const execution of executions) {
      const oracleHash = execution?.oracle?.hash || execution?.oracle?.digest;
      if (isNonEmptyString(oracleHash) && claimantArtifacts.includes(oracleHash)) {
        issues.push('oracle_reuses_claimant_artifact');
      }
    }
  }
}

function assessOracleIndependence(receipts, options = {}) {
  const list = Array.isArray(receipts) ? receipts : [];
  const distinct = collectDistinctVerifiers(list);
  const issues = [];
  const minDistinct = Number.isInteger(options.minDistinctVerifiers) && options.minDistinctVerifiers > 0
    ? options.minDistinctVerifiers : 1;
  checkVerifierCount(distinct, minDistinct, issues);
  checkClaimantEquality(distinct, options.claimantDigest, issues);
  const claimantArtifacts = Array.isArray(options.claimantArtifactHashes) ? options.claimantArtifactHashes : [];
  checkOracleArtifactReuse(list, claimantArtifacts, issues);
  const uniqueIssues = normalizeErrors(issues);
  return {
    independent: uniqueIssues.length === 0,
    distinctVerifierCount: distinct.size,
    issues: uniqueIssues,
  };
}

function summarizeValidity(receipts, options = {}) {
  const list = Array.isArray(receipts) ? receipts : [];
  const results = list.map((receipt) => validateReceiptScientificValidity(receipt, options));
  const independent = assessOracleIndependence(list, options);
  const allValid = results.length > 0 && results.every((result) => result.valid) && independent.independent;
  const averageScore = results.length
    ? clampScore(results.reduce((total, result) => total + result.score, 0) / results.length)
    : 0;
  return {
    valid: allValid,
    receiptCount: list.length,
    validReceiptCount: results.filter((result) => result.valid).length,
    averageScore,
    independence: independent,
    receipts: results,
  };
}

module.exports = {
  WORLDS,
  validateOracleDescriptor,
  executionHasEvidence,
  validateReceiptScientificValidity,
  assessOracleIndependence,
  summarizeValidity,
};
