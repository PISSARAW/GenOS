'use strict';
const { digest, fail, verifyContract } = require('./qualityContract');
const { canonical } = require('../biologicalIntegrity');
const { textOf } = require('./qualityText');
const { evaluateContent } = require('./qualityEvaluatorRegistry');
const { isIssuedAssessment } = require('./qualityReviewService');
const receipts = new WeakMap();
function extractTargetContent(report, artifact) {
  const content = artifact?.content;
  if (content && typeof content === 'object') return textOf(content) || JSON.stringify(canonical(content));
  return textOf(content) || textOf(report?.output) || textOf(report);
}
function qualityContractOf(worker) {
  const nested = worker?.workerContract?.qualityElevation, declared = worker?.qualityElevation;
  if (nested && declared && digest(nested) !== digest(declared)) {
    throw fail('GQEL_CONTRACT_CHANGED', 'Worker and mission quality obligations disagree.');
  }
  assertQualityRoutes(worker);
  return nested || declared;
}
function assertQualityRoutes(worker) {
  const nested = worker?.workerContract?.qualityRuntime, declared = worker?.qualityRuntime;
  if (nested && declared && digest(nested) !== digest(declared)) {
    throw fail('GQEL_CONTRACT_CHANGED', 'Worker and mission quality routes disagree.');
  }
}
function assertQualityResult(worker, result) {
  const contract = qualityContractOf(worker), evaluation = result.bestVersion?.evaluation;
  if (contract) verifyContract(contract);
  if (!contract || !result.promoted || !isIssuedAssessment(evaluation) || !evaluation.passed) throw fail('GQEL_UNTRUSTED_EVALUATION', 'Cannot bind an unverified quality result.');
  assertAssessmentBinding(result, evaluation, contract);
  return evaluation;
}
function assertAssessmentBinding(result, evaluation, contract) {
  if (evaluation.phase !== 'artifact' || evaluation.contractDigest !== contract.digest) throw fail('GQEL_STALE_EVALUATION', 'A final artifact assessment of this contract is required.');
  if (evaluation.artifactDigest !== result.bestVersion.digest) throw fail('GQEL_STALE_EVALUATION', 'Artifact receipt mismatch.');
  if (contract.digest !== result.contract.digest) throw fail('GQEL_CONTRACT_CHANGED', 'Worker must carry the same compiled quality contract.');
  if (result.session?.status !== 'promoted' || result.session.budget?.usageComplete !== true) throw fail('GQEL_UNTRUSTED_EVALUATION', 'Quality session did not complete with verified usage.');
}
function bindQualityResult(worker, result) {
  const evaluation = assertQualityResult(worker, result), contract = qualityContractOf(worker);
  receipts.set(worker, { contractHash: digest(contract), artifactHash: result.bestVersion.digest, evaluation });
}
function checkQualityScore(result, contract) {
  const threshold = contract.minScore ?? contract.minQualityScore ?? contract.threshold ?? 0;
  if (!Number.isFinite(result.overallScore) || result.overallScore < threshold) throw fail('WORKER_QUALITY_SCORE_DEFICIENT', 'No established quality score meeting the contract.');
}
function enforceQualityContract(worker, report, artifact) {
  const contract = qualityContractOf(worker);
  if (!contract) return null;
  const text = extractTargetContent(report, artifact);
  if (report?.qualityElevationReceipt) {
    const evaluation = require('./qualityReceiptIntegrity').assertReceipt(report.qualityElevationReceipt, { worker, text, artifact });
    checkQualityScore(evaluation, contract); return evaluation;
  }
  const receipt = worker.agentId ? null : receipts.get(worker);
  if (receipt && receipt.contractHash === digest(contract) && receipt.artifactHash === digest(text)) {
    checkQualityScore(receipt.evaluation, contract); return receipt.evaluation;
  }
  const evaluation = evaluateContent(contract.domain || 'generic', text, { contract });
  throw Object.assign(fail('WORKER_QUALITY_ELEVATION_FAILED', 'Worker failed quality elevation contract: fresh runtime review required.'), { evaluation, defects: evaluation.defects });
}
module.exports = { extractTargetContent, checkQualityScore, enforceQualityContract, bindQualityResult, assertQualityResult, qualityContractOf };
