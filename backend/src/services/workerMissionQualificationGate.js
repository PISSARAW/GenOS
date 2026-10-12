'use strict';

const { validateReceipt } = require('./epistemicVerifierReceiptService');
const { isTrusted } = require('./verifierTrustRegistry');

function decision(status, reason) { return { status, reason }; }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }

function validMission(input) {
  return nonempty(input.runId) && nonempty(input.workerId)
    && nonempty(input.resultId) && nonempty(input.expectedResultDigest)
    && nonempty(input.actualResultDigest) && nonempty(input.evidenceDigest)
    && input.runStatus === 'completed' && input.terminalEvent === 'AGENT_COMPLETED';
}

function receiptClaimMatches(receipt, input) {
  return receipt?.status === 'verified' && receipt.independent === true
    && receipt.resultId === input.resultId
    && receipt.evidenceDigest === input.evidenceDigest
    && receipt.coveredObligations?.includes(input.resultId);
}

function receiptOwnerMatches(receipt, input) {
  const execution = receipt?.executionEvidence?.[0];
  const subject = execution?.subject;
  return receipt?.executionEvidence?.length === 1
    && subject?.runId === input.runId && subject?.workerId === input.workerId
    && nonempty(execution.postconditions?.strategy)
    && execution.postconditions?.status === 'verified'
    && nonempty(receipt.independenceDescriptor?.actorId);
}

function receiptMatches(receipt, input) {
  return receiptClaimMatches(receipt, input) && receiptOwnerMatches(receipt, input)
    && nonempty(receipt.nonce) && isTrusted(receipt.verifierDigest)
    && validateReceipt(receipt, [receipt.verifierDigest]);
}

function distinctQuorum(receipts, seenNonces) {
  const nonces = receipts.map((item) => item.nonce);
  const actors = receipts.map((item) => item.independenceDescriptor.actorId);
  const strategies = receipts.map((item) => item.executionEvidence[0].postconditions.strategy);
  return new Set(nonces).size === 2 && nonces.every((nonce) => !seenNonces.has(nonce))
    && new Set(actors).size === 2 && new Set(strategies).size === 2;
}

function preflight(input, seenNonces) {
  if (input?.declaredStatus === 'abstained') return decision('abstained', 'worker_abstained');
  if (!input || !validMission(input)) return decision('inconclusive', 'mission_binding_missing');
  if (!(seenNonces instanceof Set)) return decision('inconclusive', 'nonce_registry_missing');
  if (input.actualResultDigest !== input.expectedResultDigest) {
    return decision('rejected', 'reference_result_mismatch');
  }
  return null;
}

function evaluate(input, seenNonces) {
  const preliminary = preflight(input, seenNonces);
  if (preliminary) return preliminary;
  const receipts = input.receipts;
  if (!Array.isArray(receipts) || receipts.length !== 2) {
    return decision('inconclusive', 'independent_quorum_missing');
  }
  if (!receipts.every((receipt) => receiptMatches(receipt, input))) {
    return decision('inconclusive', 'receipt_invalid_or_wrong_owner');
  }
  if (!distinctQuorum(receipts, seenNonces)) {
    return decision('inconclusive', 'receipt_replay_or_dependent_quorum');
  }
  for (const receipt of receipts) seenNonces.add(receipt.nonce);
  return decision('verified', 'independent_quorum');
}

module.exports = { evaluate };
