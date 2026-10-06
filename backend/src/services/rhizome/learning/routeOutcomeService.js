'use strict';

const receiptService = require('./routeReceiptService');
const creditService = require('./pathCreditService');

function applyOutcome(input) {
  const { session, now = Date.now(), gamma = 0.8, amount = 10 } = input;
  const receipt = receiptService.validateReceipt(session, input.receipt, input.trustedVerifierDigests || []);
  const previous = (session.routeResults || []).find(entry => entry.receipt.verification.signedReceipt.nonce === receipt.verification.signedReceipt.nonce);
  if (previous) return { ...previous.outcome, duplicate: true };
  if ((session.routeResults || []).length >= 10000) {
    throw Object.assign(new Error('Verified route history budget exhausted.'), { code: 'RHIZOME_HISTORY_BUDGET_EXHAUSTED' });
  }
  const credits = creditService.assign(receipt.edgeIds, { gamma });
  const edgeCredits = new Map(credits.map((item) => [item.edgeId, item.credit * amount]));
  session.edges = session.edges.map((edge) => updateEdge(edge, { edgeCredits, outcome: receipt.outcome, now }));
  session.graphVersion += 1;
  const outcome = { routeId: receipt.routeId, needId: receipt.needId, capability: receipt.capability,
    outcome: receipt.outcome, verificationId: receipt.verification.verificationId,
    evidenceRefs: receipt.verification.evidenceRefs, credits };
  session.routeResults = [...(session.routeResults || []), { receipt, outcome,
    graphVersion: session.graphVersion, latencyMs: input.latencyMs ?? null, recordedAt: new Date(now).toISOString() }];
  return outcome;
}

function updateEdge(edge, context) {
  const { edgeCredits, outcome, now } = context;
  const value = edgeCredits.get(edge.edgeId);
  if (value === undefined) return edge;
  const field = outcome === 'SUCCESS' ? 'positive' : 'negative';
  return {
    ...edge,
    lastUsed: new Date(now).toISOString(),
    trailState: {
      ...edge.trailState,
      [field]: Math.min(100, edge.trailState[field] + value),
      verifiedFlow: outcome === 'SUCCESS' ? Math.min(100, (edge.trailState.verifiedFlow || 0) + value) : (edge.trailState.verifiedFlow || 0),
      updatedAt: new Date(now).toISOString()
    }
  };
}

module.exports = { applyOutcome };
