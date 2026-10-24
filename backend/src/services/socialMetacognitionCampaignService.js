'use strict';

const { validateSocialMentalModel } = require('./socialMentalModelService');

const ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory',
  'genos-without-relational-physiology', 'genos-social-memory-ablated', 'genos-social-memory-counterfactual']);
const INTERVENTION_TRIPLET = Object.freeze({
  'genos-full': { mode: 'baseline', expectedKey: 'genos-full' },
  'genos-social-memory-ablated': { mode: 'mask-social-memories', expectedKey: 'genos-social-memory-ablated' },
  'genos-social-memory-counterfactual': { mode: 'counterfactual-social-memories', expectedKey: 'genos-social-memory-counterfactual' },
});

function incomplete() {
  return { status: 'inconclusive', reasons: ['Required arm, model, decision or intervention evidence is missing.'] };
}

function invalidArms(arms) {
  const declared = Object.keys(arms).sort();
  const required = [...ARMS].sort();
  return declared.length !== required.length || declared.some((arm, index) => arm !== required[index])
    || ARMS.some((arm) => !arms[arm]?.model || !arms[arm]?.decision || !arms[arm]?.interventionReceipt);
}

function modelErrors(arm, model) {
  const errors = [];
  if (!validateSocialMentalModel(model)) errors.push(`${arm}:model-invalid`);
  if (model.authority !== 'descriptive-only' || model.promotionEligible !== false) errors.push(`${arm}:authority-boundary-violated`);
  return errors;
}

function decisionErrors(arm, decision, model) {
  const errors = [];
  if (!decision.receiptId || !Array.isArray(decision.memoryReferences)) errors.push(`${arm}:decision-evidence-missing`);
  if (decision.memoryReferences?.some((id) => !model.sourceMemoryIds.includes(id))) errors.push(`${arm}:ungrounded-decision-reference`);
  return errors;
}

function armErrors(arm, entry) {
  return [
    ...modelErrors(arm, entry.model),
    ...decisionErrors(arm, entry.decision, entry.model),
    ...interventionErrors(arm, entry.interventionReceipt)
  ];
}

function interventionErrors(arm, receipt) {
  const treatment = INTERVENTION_TRIPLET[arm];
  if (!treatment) return receipt.mode === 'baseline' ? [] : [`${arm}:unexpected-social-intervention`];
  if (treatment.mode === 'baseline') return hasBaselineReceipt(receipt) ? [] : [`${arm}:baseline-receipt-incomplete`];
  if (!hasCompleteInterventionReceipt(receipt, treatment.mode)) return [`${arm}:intervention-receipt-incomplete`];
  if (treatment.mode === 'counterfactual-social-memories' && hasReplacementCountMismatch(receipt)) {
    return [`${arm}:replacement-count-mismatch`];
  }
  return [];
}

function hasBaselineReceipt(receipt) {
  return Boolean(receipt.interventionId && receipt.mode === 'baseline'
    && receipt.beforeHash && receipt.beforeHash === receipt.afterHash);
}

function hasCompleteInterventionReceipt(receipt, expectedMode) {
  const hashesChanged = receipt.beforeHash && receipt.afterHash && receipt.beforeHash !== receipt.afterHash;
  return Boolean(receipt.interventionId && receipt.mode === expectedMode && hashesChanged
    && receipt.preservedNonSocialMemoryHash && Array.isArray(receipt.removedMemoryIds)
    && receipt.removedMemoryIds.length > 0);
}

function hasReplacementCountMismatch(receipt) {
  return !Array.isArray(receipt.addedMemoryIds) || receipt.addedMemoryIds.length !== receipt.removedMemoryIds.length;
}

function baselineErrors(model) {
  const hasEnoughMemories = model.sourceMemoryIds.length >= 4;
  const hasBelief = model.beliefsAboutOther.length > 0;
  const hasAlternative = model.alternativeInterpretations?.length > 0;
  const hasUnknown = model.unknowns.length > 0;
  return hasEnoughMemories && hasBelief && hasAlternative && hasUnknown ? [] : ['baseline:model-evidence-incomplete'];
}

function equalContext(arms) {
  const keys = ['contextHash', 'budgetHash', 'permissionHash'];
  return keys.every((key) => typeof arms['genos-full'].decision[key] === 'string'
    && arms['genos-full'].decision[key].length > 0
    && ARMS.every((arm) => arms[arm].decision[key] === arms['genos-full'].decision[key]));
}

function sameIds(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

function memoryPairingErrors(arms) {
  const errors = [];
  const baselineIds = arms['genos-full'].model.sourceMemoryIds;
  const unchanged = ['static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'];
  for (const arm of unchanged) {
    if (!sameIds(arms[arm].model.sourceMemoryIds, baselineIds)) errors.push(`${arm}:source-memories-differ-from-baseline`);
  }
  const masked = arms['genos-social-memory-ablated'];
  if (!sameIds(masked.interventionReceipt.removedMemoryIds, baselineIds)
    || masked.model.sourceMemoryIds.some((id) => baselineIds.includes(id))) errors.push('genos-social-memory-ablated:memory-mask-mismatch');
  const counterfactual = arms['genos-social-memory-counterfactual'];
  if (!sameIds(counterfactual.interventionReceipt.removedMemoryIds, baselineIds)
    || !sameIds(counterfactual.interventionReceipt.addedMemoryIds, counterfactual.model.sourceMemoryIds)) {
    errors.push('genos-social-memory-counterfactual:replacement-memory-mismatch');
  }
  return errors;
}

function actionErrors(arms, expectedActions) {
  const errors = [];
  for (const arm of Object.values(INTERVENTION_TRIPLET)) {
    if (arms[arm.expectedKey].decision.action !== expectedActions[arm.expectedKey]) errors.push(`${arm.expectedKey}:unexpected-action`);
  }
  if (arms['genos-full'].decision.action === arms['genos-social-memory-ablated'].decision.action) errors.push('masked-memory-did-not-change-decision');
  if (arms['genos-full'].decision.action === arms['genos-social-memory-counterfactual'].decision.action) errors.push('counterfactual-memory-did-not-change-decision');
  return errors;
}

function evaluateSocialMetacognition(input = {}) {
  const arms = input.arms || {};
  if (invalidArms(arms) || !input.expectedActions) return incomplete();
  const errors = ARMS.flatMap((arm) => armErrors(arm, arms[arm]));
  errors.push(...baselineErrors(arms['genos-full'].model));
  if (!equalContext(arms)) errors.push('context-budget-or-permissions-differ-between-arms');
  errors.push(...memoryPairingErrors(arms));
  errors.push(...actionErrors(arms, input.expectedActions));
  const evidenceRefs = ARMS.flatMap((arm) => [arms[arm].decision.receiptId, ...arms[arm].model.sourceMemoryIds,
    arms[arm].interventionReceipt.interventionId].filter(Boolean));
  return { status: errors.length ? 'fail' : 'pass', reasons: errors, evidenceRefs: [...new Set(evidenceRefs)] };
}

module.exports = { ARMS, INTERVENTION_TRIPLET, evaluateSocialMetacognition };
