'use strict';

const receiptService = require('./routeReceiptService');
const creditService = require('./pathCreditService');

function applyOutcome(input) {
  const { session, now = Date.now(), gamma = 0.8, amount = 10 } = input;
  const receipt = receiptService.validateReceipt(session, input.receipt, input.trustedVerifierDigests || []);
  const credits = creditService.assign(receipt.edgeIds, { gamma });
  const edgeCredits = new Map(credits.map((item) => [item.edgeId, item.credit * amount]));
  session.edges = session.edges.map((edge) => updateEdge(edge, { edgeCredits, outcome: receipt.outcome, now }));
  session.graphVersion += 1;
  return { routeId: receipt.routeId, outcome: receipt.outcome, verificationId: receipt.verification.verificationId, evidenceRefs: receipt.verification.evidenceRefs, credits };
}

function updateEdge(edge, context) {
  const { edgeCredits, outcome, now } = context;
  const value = edgeCredits.get(edge.edgeId);
  if (value === undefined) return edge;
  const field = outcome === 'SUCCESS' ? 'positive' : 'negative';
  return {
    ...edge,
    lastUsed: new Date(now).toISOString(),
    trailState: { ...edge.trailState, [field]: Math.min(100, edge.trailState[field] + value), updatedAt: new Date(now).toISOString() }
  };
}

module.exports = { applyOutcome };
