'use strict';

const persistence = require('./agowStatePersistenceService');
const SCOPE = 'agow_cognitive_mode_experiences';

async function load(options) {
  const result = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return { db: result.db, state: result.state };
}

async function recordDecision(options) {
  const receipt = { ...options.receipt, realizedLoss: null, predictionError: null };
  await persistence.update({ scope: SCOPE, agentId: options.agentId, db: options.db }, (state) =>
    ({ receipts: [...(state.receipts || []), receipt].slice(-2000) }));
  return receipt;
}

async function observeOutcome(options) {
  let receipt;
  await persistence.update({ scope: SCOPE, agentId: options.agentId, db: options.db }, (state) => {
    const receipts = state.receipts || [];
    const index = receipts.findIndex((item) => item.receiptId === options.receiptId);
    if (index < 0) throw new Error('cognitive-mode-receipt-not-found');
    receipt = outcomeReceipt(receipts[index], options);
    receipts[index] = receipt;
    return { receipts };
  });
  return { ...receipt, calibrated: true };
}

function outcomeReceipt(prior, options) {
  const mode = options.mode || prior.chosenMode;
  if (mode !== prior.chosenMode) throw new Error('cognitive-mode-outcome-mode-mismatch');
  const outcome = require('./cognitiveModePolicyService').observeOutcome({ decision: prior.decision,
    mode, realizedLoss: options.realizedLoss });
  if (Number.isFinite(prior.realizedLoss) && prior.realizedLoss !== outcome.realizedLoss) {
    throw new Error('cognitive-mode-outcome-already-recorded');
  }
  return { ...prior, realizedLoss: outcome.realizedLoss, predictionError: outcome.predictionError };
}

module.exports = { load, recordDecision, observeOutcome, SCOPE };
