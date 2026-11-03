'use strict';
const crypto = require('node:crypto');
const { digest, fail, freeze, verifyContract } = require('./qualityContract');
const { canonical } = require('../biologicalIntegrity');
const ledgerIntegrity = require('../gvxLedgerIntegrity');
const SCHEMA = 'genos.gqel-quality-receipt/v1';

function signatureFor(body) {
  ledgerIntegrity.assertSigningKeyConfigured();
  return ledgerIntegrity.macEvent(digest(body));
}

function sign(body) { return freeze({ ...body, signature: signatureFor(body) }); }

function authenticated(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  const { signature, ...body } = receipt;
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(signatureFor(body), 'hex'));
  } catch (_) { return false; }
}

function runIdOf(worker) { return worker.executionRunId || worker.executionRun?.id || worker.runId; }

function identity(worker, executionRunId) {
  const agentId = worker.agentId, runId = executionRunId || runIdOf(worker);
  if (!agentId || !runId || !worker.missionId) throw fail('GQEL_RECEIPT_SCOPE_REQUIRED', 'Worker, mission and execution run identities are required.');
  const authorityHash = worker.executionAuthorityRef?.hash;
  if (!/^[a-f0-9]{64}$/.test(authorityHash || '')) throw fail('GQEL_RECEIPT_AUTHORITY_REQUIRED', 'A sealed execution authority is required.');
  return { agentId, runId, missionId: worker.missionId, authorityHash };
}

function assertExpectedScope(receipt, worker) {
  const runId = runIdOf(worker);
  if (!worker.agentId || !runId) throw fail('GQEL_RECEIPT_SCOPE_REQUIRED', 'Independent worker and execution run identities are required.');
  if (receipt.agentId !== worker.agentId || receipt.runId !== runId) throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Quality receipt belongs to another worker or execution run.');
  if (worker.missionId && receipt.missionId !== worker.missionId) throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Quality receipt belongs to another mission.');
  const authority = worker.executionAuthorityRef?.hash;
  if (authority && receipt.authorityHash !== authority) throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Quality receipt belongs to another authority envelope.');
}

function assertReceipt(receipt, context) {
  const trusted = authenticated(receipt) || require('./qualityNativeVerification').authenticated(receipt, context);
  if (!trusted || receipt.schema !== SCHEMA) throw fail('GQEL_RECEIPT_INVALID', 'Quality receipt authentication failed.');
  assertExpectedScope(receipt, context.worker);
  const contract = require('./workerQualityContractEnforcer').qualityContractOf(context.worker);
  verifyContract(contract);
  if (receipt.contractDigest !== contract.digest || receipt.artifactDigest !== digest(context.text)) throw fail('GQEL_STALE_EVALUATION', 'Quality receipt does not bind the exact contract and artifact.');
  assertDeliveryContent(receipt, context.artifact);
  assertAssessment(receipt);
  return freeze(receipt.evaluation);
}

function assertDeliveryContent(receipt, artifact) {
  if (!receipt.deliveryContentDigest) return;
  if (!artifact || receipt.deliveryType !== artifact.type || receipt.deliveryContentDigest !== digest(artifact.content)) {
    throw fail('GQEL_STALE_EVALUATION', 'Delivered typed artifact content differs from its quality receipt.');
  }
}

function assertAssessment(receipt) {
  const evaluation = receipt.evaluation;
  if (evaluation?.passed !== true || evaluation.phase !== 'artifact') throw fail('GQEL_RECEIPT_INVALID', 'A passing final artifact assessment is required.');
  if (evaluation.contractDigest !== receipt.contractDigest || evaluation.artifactDigest !== receipt.reviewedArtifactDigest) throw fail('GQEL_RECEIPT_INVALID', 'Assessment binding differs from the receipt.');
  if (!receipt.codeBinding && receipt.artifactDigest !== receipt.reviewedArtifactDigest) throw fail('GQEL_RECEIPT_INVALID', 'Different review and delivery targets require a code evidence binding.');
  if (digest(evaluation) !== receipt.assessmentDigest) throw fail('GQEL_RECEIPT_INVALID', 'Assessment integrity differs from the receipt.');
  assertValidityInterval(receipt);
}

function assertValidityInterval(receipt) {
  const issuedAt = Date.parse(receipt.issuedAt), expiresAt = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > expiresAt) throw fail('GQEL_RECEIPT_INVALID', 'Quality receipt validity interval is invalid.');
  if (Date.now() >= expiresAt) throw fail('GQEL_RECEIPT_EXPIRED', 'Quality receipt cannot authorize a new delivery after its execution lease expires.');
}

function encode(value) { return JSON.stringify(canonical(value)); }
module.exports = { SCHEMA, sign, authenticated, identity, assertReceipt, assertExpectedScope, encode, runIdOf };
