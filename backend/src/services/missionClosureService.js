'use strict';

const completionContract = require('./missionCompletionContract');
const { digest } = require('./evidenceContractService');

function invariantAssessment(invariants) {
  if (!Array.isArray(invariants) || !invariants.length
      || invariants.some((item) => !item?.id || typeof item.passed !== 'boolean')) {
    return { passed: false, failed: false, reason: 'completion_invariants_missing' };
  }
  if (invariants.some((item) => item.passed !== true)) {
    return { passed: false, failed: true, reason: 'completion_invariant_failed' };
  }
  return { passed: true, failed: false, reason: null };
}

function uniqueVerifierIds(oracle, producerId) {
  const ids = oracle?.verifierIds;
  return Array.isArray(ids) && ids.length > 0
    && ids.every((id) => typeof id === 'string' && id.trim() && id !== producerId)
    && new Set(ids).size === ids.length;
}

function validOracleReceipt(input) {
  const oracle = input.oracle;
  return oracle?.receipt && oracle.receipt.missionId === input.missionId
    && completionContract.validHash(oracle.receiptHash)
    && digest(oracle.receipt) === oracle.receiptHash;
}

function validOracleEvidence(oracle, evidenceRefs) {
  const refs = oracle?.evidenceRefs;
  const available = new Set(evidenceRefs);
  return Array.isArray(refs) && refs.length > 0
    && refs.every((ref) => completionContract.validHash(ref) && available.has(ref));
}

function oracleAssessment(input, evidenceRefs) {
  const oracle = input.oracle;
  const passed = oracle?.status === 'verified' && oracle.independent === true
    && uniqueVerifierIds(oracle, input.producerId) && validOracleReceipt(input)
    && validOracleEvidence(oracle, evidenceRefs);
  return { passed, failed: oracle?.status === 'failed',
    reason: passed ? null : oracle?.status === 'failed'
      ? 'independent_oracle_failed' : 'independent_oracle_missing' };
}

function requiredWorkersAssessment(input, result) {
  const required = input.requiredMemberIds;
  const completed = new Set(result.completedMemberIds);
  const passed = Array.isArray(required) && required.length > 0
    && required.every((id) => completed.has(id));
  return { passed, failed: result.verdict === 'failed',
    reason: passed ? null : 'required_workers_incomplete' };
}

function evidenceAssessment(input, result) {
  const required = Array.isArray(input.requiredMemberIds) ? input.requiredMemberIds.length : 0;
  const passed = required > 0 && result.evidenceRefs.length >= required;
  return { passed, failed: false, reason: passed ? null : 'required_evidence_missing' };
}

function closureVerdict(result, checks) {
  if (result.verdict === 'in_progress' || result.verdict === 'interrupted') return result.verdict;
  if (result.verdict === 'failed' || checks.some((check) => check.failed)) return 'failed';
  if (result.verdict !== 'succeeded' || checks.some((check) => !check.passed)) return 'partial';
  return 'succeeded';
}

function closeMission(input = {}) {
  const result = completionContract.evaluate(input);
  const workers = requiredWorkersAssessment(input, result);
  const evidence = evidenceAssessment(input, result);
  const invariants = invariantAssessment(input.invariants);
  const oracle = oracleAssessment(input, result.evidenceRefs);
  const checks = [workers, invariants, oracle, evidence];
  const verdict = input.lifecycleState === 'completed' ? closureVerdict(result, checks) : result.verdict;
  const reasons = [...new Set([...result.reasons,
    ...checks.filter((check) => !check.passed).map((check) => check.reason)])];
  return { ...result, verdict, success: verdict === 'succeeded',
    reasons, promotionEligible: verdict === 'succeeded',
    closureChecks: { requiredWorkers: workers.passed, invariants: invariants.passed,
      independentOracle: oracle.passed, evidence: evidence.passed } };
}

module.exports = { closeMission, invariantAssessment, oracleAssessment };
