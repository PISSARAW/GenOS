'use strict';

const persistence = require('./agowStatePersistenceService');
const SCOPE = 'agow_cognitive_mode_experiences';

async function load(options) {
  const result = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return { db: result.db, state: result.state };
}

async function recordDecision(options) {
  const result = await load(options);
  const receipts = Array.isArray(result.state.receipts) ? result.state.receipts : [];
  const receipt = { ...options.receipt, realizedLoss: null, predictionError: null };
  receipts.push(receipt);
  await save(result, options.agentId, receipts);
  return receipt;
}

async function observeOutcome(options) {
  const result = await load(options);
  const receipts = Array.isArray(result.state.receipts) ? result.state.receipts : [];
  const index = receipts.findIndex((item) => item.receiptId === options.receiptId);
  if (index < 0) throw new Error('cognitive-mode-receipt-not-found');
  const prior = receipts[index];
  const outcome = require('./cognitiveModePolicyService').observeOutcome({
    decision: prior.decision, mode: options.mode || prior.chosenMode, realizedLoss: options.realizedLoss
  });
  receipts[index] = { ...prior, realizedLoss: outcome.realizedLoss, predictionError: outcome.predictionError };
  await save(result, options.agentId, receipts);
  return { ...receipts[index], calibrated: true };
}

async function save(result, agentId, receipts) {
  await persistence.save({ scope: SCOPE, agentId, db: result.db,
    state: { receipts: receipts.slice(-2000) }, version: receipts.length });
}

module.exports = { load, recordDecision, observeOutcome, SCOPE };
