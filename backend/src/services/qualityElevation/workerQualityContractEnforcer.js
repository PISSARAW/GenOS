'use strict';
const { digest, fail, verifyContract } = require('./qualityContract');
const { textOf } = require('./qualityText');
const { evaluateContent } = require('./qualityEvaluatorRegistry');
const { isIssuedAssessment } = require('./qualityReviewService');
const receipts = new WeakMap();
function extractTargetContent(report, artifact) { return textOf(artifact?.content) || textOf(report?.output) || textOf(report); }
function workerContract(worker) { return worker?.workerContract?.qualityElevation; }
function bindQualityResult(worker, result) {
  const contract = workerContract(worker), evaluation = result.bestVersion?.evaluation;
  if (contract) verifyContract(contract);
  if (!contract || !result.promoted || !isIssuedAssessment(evaluation) || !evaluation.passed) throw fail('GQEL_UNTRUSTED_EVALUATION', 'Cannot bind an unverified quality result.');
  if (evaluation.phase !== 'artifact' || evaluation.contractDigest !== contract.digest) throw fail('GQEL_STALE_EVALUATION', 'A final artifact assessment of this contract is required.');
  if (evaluation.artifactDigest !== result.bestVersion.digest) throw fail('GQEL_STALE_EVALUATION', 'Artifact receipt mismatch.');
  if (contract.digest !== result.contract.digest) throw fail('GQEL_CONTRACT_CHANGED', 'Worker must carry the same compiled quality contract.');
  receipts.set(worker, { contractHash: digest(contract), artifactHash: result.bestVersion.digest, evaluation });
}
function checkQualityScore(result, contract) {
  const threshold = contract.minScore ?? contract.minQualityScore ?? contract.threshold ?? 0;
  if (!Number.isFinite(result.overallScore) || result.overallScore < threshold) throw fail('WORKER_QUALITY_SCORE_DEFICIENT', 'No established quality score meeting the contract.');
}
function enforceQualityContract(worker, report, artifact) {
  const contract = workerContract(worker);
  if (!contract) return null;
  const text = extractTargetContent(report, artifact), receipt = receipts.get(worker);
  if (receipt && receipt.contractHash === digest(contract) && receipt.artifactHash === digest(text)) {
    checkQualityScore(receipt.evaluation, contract); return receipt.evaluation;
  }
  const evaluation = evaluateContent(contract.domain || 'generic', text, { contract });
  throw Object.assign(fail('WORKER_QUALITY_ELEVATION_FAILED', 'Worker failed quality elevation contract: fresh runtime review required.'), { evaluation, defects: evaluation.defects });
}
module.exports = { extractTargetContent, checkQualityScore, enforceQualityContract, bindQualityResult };
