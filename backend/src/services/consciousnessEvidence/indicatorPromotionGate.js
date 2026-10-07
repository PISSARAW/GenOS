'use strict';

const STAGES = Object.freeze(['specified', 'implemented', 'causal', 'generalized', 'operational']);
const REQUIREMENTS = Object.freeze({
  specified: ['specification'],
  implemented: ['specification', 'implementation'],
  causal: ['specification', 'implementation', 'local_causal_ablation'],
  generalized: ['specification', 'implementation', 'local_causal_ablation', 'external_task_campaign'],
  operational: ['specification', 'implementation', 'local_causal_ablation', 'external_task_campaign', 'reserved_replication']
});
const verification = require('./indicatorVerificationService');

function evaluate(options) {
  if (!options.indicatorId) throw new TypeError('Indicator identity required.');
  const receipts = validReceipts(options.receipts || []).filter((item) => item.indicatorId === options.indicatorId
    && verification.sameScope(item.scope, options.scope) && item.contextHash === options.contextHash);
  const target = options.targetStage || 'operational';
  if (!STAGES.includes(target)) throw new TypeError('Unknown consciousness evidence stage.');
  const missing = REQUIREMENTS[target].filter((kind) => !receipts.some((item) => item.kind === kind));
  return { indicatorId: options.indicatorId, stage: target, eligible: missing.length === 0,
    missingRequirements: missing, acceptedReceiptHashes: receipts.map((item) => item.receiptHash),
    promotionAllowed: missing.length === 0 && target === 'operational' };
}

function validReceipts(receipts) {
  if (!Array.isArray(receipts)) return [];
  return receipts.filter((item) => verification.isVerified(item) && REQUIREMENTS.operational.includes(item.kind));
}

function highestStage(receipts, options = {}) {
  let highest = 'not_assessed';
  for (const stage of STAGES) {
    if (evaluate({ indicatorId: options.indicatorId || 'unspecified', scope: options.scope,
      contextHash: options.contextHash, targetStage: stage, receipts }).eligible) highest = stage;
    else break;
  }
  return highest;
}

module.exports = { STAGES, REQUIREMENTS, evaluate, validReceipts, highestStage };
