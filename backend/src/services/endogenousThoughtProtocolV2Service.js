'use strict';

const CONDITIONS = Object.freeze(['full', 'llm_only']);
const PARITY_FIELDS = Object.freeze(['model', 'parameters', 'tools', 'budget']);

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && expected.every((item) => actual.includes(item));
}

function validSeeds(value) {
  return Array.isArray(value) && value.length > 0
    && value.every((seed) => Number.isInteger(seed));
}

function validateIdentity(protocol, errors) {
  add(errors, protocol?.schema === 'genos.endogenous-thought-protocol/v2', 'INVALID_SCHEMA');
  add(errors, protocol?.protocolId === 'ett-v2', 'INVALID_PROTOCOL_ID');
  add(errors, protocol?.status === 'preregistered_not_run', 'PROTOCOL_ALREADY_EXECUTED');
  add(errors, protocol?.executed === false, 'PROTOCOL_ALREADY_EXECUTED');
  add(errors, protocol?.promotionDecision === null, 'PROMOTION_DECISION_PRECOMMITTED');
}

function validateConditions(protocol, errors) {
  add(errors, sameMembers(protocol?.conditions, CONDITIONS), 'INVALID_CONDITIONS');
  add(errors, protocol?.conditionContracts?.full?.endogenousLoopEnabled === true,
    'INVALID_FULL_CONDITION');
  const baseline = protocol?.conditionContracts?.llm_only;
  add(errors, baseline?.endogenousLoopEnabled === false && baseline?.singleDirectSolve === true,
    'INVALID_LLM_ONLY_CONDITION');
  add(errors, sameMembers(protocol?.comparison?.primaryPair, CONDITIONS), 'INVALID_PRIMARY_PAIR');
  add(errors, sameMembers(protocol?.comparison?.parityRequired, PARITY_FIELDS),
    'INCOMPLETE_PARITY_REQUIREMENTS');
}

function validateProviders(protocol, errors) {
  const providers = protocol?.providers;
  add(errors, providers?.solver === 'injected', 'SOLVER_NOT_INJECTED');
  add(errors, providers?.verifier === 'injected_independent', 'VERIFIER_NOT_INDEPENDENT');
  add(errors, providers?.usageMeter === 'injected_external', 'COST_METER_NOT_EXTERNAL');
  add(errors, providers?.producerCanVerifyOwnOutput === false, 'SELF_VERIFICATION_ALLOWED');
  add(errors, providers?.selfReportedCostsAccepted === false, 'SELF_REPORTED_COSTS_ALLOWED');
}

function validateCorpus(protocol, errors) {
  const development = protocol?.corpus?.development;
  const reserved = protocol?.corpus?.reserved;
  add(errors, validSeeds(development?.seeds), 'INVALID_DEVELOPMENT_CORPUS');
  add(errors, validSeeds(reserved?.seeds), 'INVALID_RESERVED_CORPUS');
  const overlap = development?.seeds?.some((seed) => reserved?.seeds?.includes(seed));
  add(errors, overlap === false, 'CORPUS_LEAKAGE');
  add(errors, development?.availableForTuning === true, 'DEVELOPMENT_CORPUS_NOT_DECLARED');
  add(errors, reserved?.availableForTuning === false, 'RESERVED_CORPUS_EXPOSED');
  add(errors, reserved?.minimumIndependentReplications >= 3, 'HOLDOUT_REPLICATIONS_INSUFFICIENT');
}

function validateEvidence(protocol, metricSet, errors) {
  const policy = protocol?.evidencePolicy;
  add(errors, policy?.modelOutputIsEvidence === false, 'MODEL_OUTPUT_ACCEPTED_AS_EVIDENCE');
  add(errors, policy?.independentVerificationRequired === true, 'VERIFICATION_NOT_REQUIRED');
  add(errors, policy?.externalCostMeasurementRequired === true, 'EXTERNAL_COST_NOT_REQUIRED');
  add(errors, policy?.scientificPromotionAllowed === false, 'SCIENTIFIC_PROMOTION_ALLOWED');
  add(errors, protocol?.analysisPlan?.minimumHoldoutReplications >= 3,
    'HOLDOUT_REPLICATIONS_INSUFFICIENT');
  add(errors, protocol?.analysisPlan?.reservedCorpusUsedForTuning === false, 'RESERVED_CORPUS_EXPOSED');
  add(errors, metricSet?.promotionEligible === false, 'METRIC_SET_PROMOTION_ELIGIBLE');
  add(errors, protocol?.primaryMetricId === metricSet?.primaryMetricId, 'PRIMARY_METRIC_MISMATCH');
}

function validateSafety(protocol, errors) {
  const boundary = protocol?.safetyBoundary;
  for (const key of ['authorityAblated', 'sandboxAblated', 'budgetEnforcementAblated',
    'evidenceGateAblated']) add(errors, boundary?.[key] === false, 'SAFETY_BOUNDARY_ABLATED');
}

function validateProtocolV2(protocol, metricSet) {
  const errors = [];
  validateIdentity(protocol, errors);
  validateConditions(protocol, errors);
  validateProviders(protocol, errors);
  validateCorpus(protocol, errors);
  validateEvidence(protocol, metricSet, errors);
  validateSafety(protocol, errors);
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

module.exports = { CONDITIONS, PARITY_FIELDS, validateProtocolV2 };
