'use strict';

const STAGES = Object.freeze(['specified', 'implemented', 'causal', 'generalized', 'operational']);
const REQUIREMENTS = Object.freeze({
  specified: ['specification'],
  implemented: ['specification', 'implementation'],
  causal: ['specification', 'implementation', 'local_causal_ablation'],
  generalized: ['specification', 'implementation', 'local_causal_ablation', 'external_task_campaign'],
  operational: ['specification', 'implementation', 'local_causal_ablation', 'external_task_campaign', 'reserved_replication']
});
const TEST_CLASSES = new Set(['unit_test', 'test_result', 'integration_test']);

function evaluate(options) {
  const receipts = validReceipts(options.receipts || []);
  const target = options.targetStage || 'operational';
  if (!STAGES.includes(target)) throw new TypeError('Unknown consciousness evidence stage.');
  const missing = REQUIREMENTS[target].filter((kind) => !receipts.some((item) => item.kind === kind));
  return { indicatorId: options.indicatorId, stage: target, eligible: missing.length === 0,
    missingRequirements: missing, acceptedReceiptHashes: receipts.map((item) => item.receiptHash),
    promotionAllowed: missing.length === 0 && target === 'operational' };
}

function validReceipts(receipts) {
  return receipts.filter((item) => item?.independentVerification === true && item?.verified === true
    && item.verifierId && !TEST_CLASSES.has(item.evidenceClass)
    && /^[a-f0-9]{64}$/.test(item.receiptHash || '') && REQUIREMENTS.operational.includes(item.kind));
}

function highestStage(receipts) {
  let highest = 'not_assessed';
  for (const stage of STAGES) {
    if (evaluate({ indicatorId: 'unspecified', targetStage: stage, receipts }).eligible) highest = stage;
    else break;
  }
  return highest;
}

module.exports = { STAGES, REQUIREMENTS, evaluate, validReceipts, highestStage };
