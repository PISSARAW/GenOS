'use strict';

const { validateSocialMentalModel } = require('./socialMentalModelService');

const ARMS = ['baseline', 'masked', 'counterfactual'];

function incomplete() {
  return { status: 'inconclusive', reasons: ['Required arm, model, decision or intervention evidence is missing.'] };
}

function invalidArms(arms) {
  return ARMS.some((arm) => !arms[arm] || !arms[arm].model || !arms[arm].decision || !arms[arm].interventionReceipt);
}

function armErrors(arm, entry) {
  const errors = [];
  if (!validateSocialMentalModel(entry.model)) errors.push(`${arm}:model-invalid`);
  const decision = entry.decision;
  if (!decision.receiptId || !Array.isArray(decision.memoryReferences)) errors.push(`${arm}:decision-evidence-missing`);
  if (entry.model.authority !== 'descriptive-only' || entry.model.promotionEligible !== false) errors.push(`${arm}:authority-boundary-violated`);
  if (decision.memoryReferences?.some((id) => !entry.model.sourceMemoryIds.includes(id))) errors.push(`${arm}:ungrounded-decision-reference`);
  errors.push(...interventionErrors(arm, entry.interventionReceipt));
  return errors;
}

function interventionErrors(arm, receipt) {
  if (arm === 'baseline') return baselineInterventionErrors(receipt);
  const expectedMode = interventionMode(arm);
  if (!hasCompleteInterventionReceipt(receipt, expectedMode)) return [`${arm}:intervention-receipt-incomplete`];
  if (arm === 'counterfactual' && hasReplacementCountMismatch(receipt)) return ['counterfactual:replacement-count-mismatch'];
  return [];
}

function baselineInterventionErrors(receipt) {
  return receipt.mode === 'baseline' ? [] : ['baseline:intervention-unexpected'];
}

function interventionMode(arm) {
  return arm === 'masked' ? 'mask-social-memories' : 'counterfactual-social-memories';
}

function hasCompleteInterventionReceipt(receipt, expectedMode) {
  return Boolean(receipt.interventionId && receipt.mode === expectedMode
    && receipt.beforeHash && receipt.afterHash && receipt.beforeHash !== receipt.afterHash
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
  return keys.every((key) => ARMS.every((arm) => arms[arm].decision[key] === arms.baseline.decision[key]));
}

function actionErrors(arms, expectedActions) {
  const errors = [];
  for (const arm of ARMS) {
    if (arms[arm].decision.action !== expectedActions[arm]) errors.push(`${arm}:unexpected-action`);
  }
  if (arms.baseline.decision.action === arms.masked.decision.action) errors.push('masked-memory-did-not-change-decision');
  if (arms.baseline.decision.action === arms.counterfactual.decision.action) errors.push('counterfactual-memory-did-not-change-decision');
  return errors;
}

function evaluateSocialMetacognition(input = {}) {
  const arms = input.arms || {};
  if (invalidArms(arms) || !input.expectedActions) return incomplete();
  const errors = ARMS.flatMap((arm) => armErrors(arm, arms[arm]));
  errors.push(...baselineErrors(arms.baseline.model));
  if (!equalContext(arms)) errors.push('context-budget-or-permissions-differ-between-arms');
  errors.push(...actionErrors(arms, input.expectedActions));
  return { status: errors.length ? 'fail' : 'pass', reasons: errors,
    evidenceRefs: ARMS.flatMap((arm) => [arms[arm].decision.receiptId, ...arms[arm].model.sourceMemoryIds]) };
}

module.exports = { evaluateSocialMetacognition };
