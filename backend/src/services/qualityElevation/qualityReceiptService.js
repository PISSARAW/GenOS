'use strict';
const { digest, fail, freeze } = require('./qualityContract');
const integrity = require('./qualityReceiptIntegrity');
const store = require('./qualityReceiptStore');
const authority = require('../missionEnvelopeAuthority');

async function authorized(input) {
  const identity = integrity.identity(input.worker, input.executionRunId);
  const verified = await authority.assertRun(input.db, {
    agentId: identity.agentId, runId: identity.runId, mission: input.worker });
  if (verified.hash !== identity.authorityHash) throw fail('GQEL_RECEIPT_AUTHORITY_REQUIRED', 'Quality receipt authority does not match the active execution.');
  return { ...identity, expiresAt: verified.envelope.expiresAt };
}

function receiptBody(scope, result, delivery) {
  const evaluation = result.bestVersion.evaluation;
  return { schema: integrity.SCHEMA,
    receiptId: `gqel-${digest({ runId: scope.runId, contractDigest: result.contract.digest })}`,
    ...scope, contractDigest: result.contract.digest, artifactDigest: delivery.artifactDigest,
    reviewedArtifactDigest: result.bestVersion.digest, codeBinding: delivery.codeBinding,
    deliveryContentDigest: delivery.contentDigest, deliveryType: delivery.type,
    assessmentDigest: digest(evaluation), evaluation,
    sessionId: result.session.sessionId, sessionDigest: digest(result.session),
    issuedAt: evaluation.issuedAt, qualityAccepted: true, authorizesMissionPromotion: false };
}

async function issueQualityReceipt(input) {
  const enforcer = require('./workerQualityContractEnforcer');
  enforcer.assertQualityResult(input.worker, input.result);
  const scope = await authorized(input);
  const delivery = await deliveryBinding(input);
  const receipt = integrity.sign(receiptBody(scope, input.result, delivery));
  await store.put(input.db, { receipt, session: input.result.session });
  return receipt;
}

async function deliveryBinding(input) {
  if (!input.artifact) return { artifactDigest: input.result.bestVersion.digest, codeBinding: null, contentDigest: null, type: null };
  const text = require('./workerQualityContractEnforcer').extractTargetContent(input.report, input.artifact);
  const artifactDigest = digest(text), contentDigest = digest(input.artifact.content), type = input.artifact.type;
  if (artifactDigest === input.result.bestVersion.digest) return { artifactDigest, codeBinding: null, contentDigest, type };
  const codeBinding = await require('./qualityCodeReceiptBinding').bindCodeDelivery(input);
  return { artifactDigest, codeBinding, contentDigest, type };
}

async function loadQualityReceipt(input) {
  const scope = await authorized(input);
  const contract = require('./workerQualityContractEnforcer').qualityContractOf(input.worker);
  const found = await store.get(input.db, { runId: scope.runId, contractDigest: contract?.digest });
  if (!found) throw fail('GQEL_RECEIPT_MISSING', 'No persisted quality receipt exists for this execution and contract.');
  integrity.assertReceipt(found.receipt, { worker: { ...input.worker, executionRunId: scope.runId },
    text: input.text, artifact: input.artifact });
  return freeze(found);
}

async function recordQualityCheckpoint(input) {
  const scope = await authorized(input), session = input.session;
  const contract = require('./workerQualityContractEnforcer').qualityContractOf(input.worker);
  if (session?.contract?.digest !== contract?.digest) throw fail('GQEL_CONTRACT_CHANGED', 'Checkpoint contract does not match its worker.');
  const sequence = session.events.length;
  return store.checkpoint(input.db, { schema: 'genos.gqel-quality-checkpoint/v1', ...scope,
    contractDigest: contract.digest, sequence, session });
}

module.exports = { issueQualityReceipt, loadQualityReceipt, recordQualityCheckpoint };
