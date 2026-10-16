'use strict';

const controller = require('./variantRuntimeController');
const runtime = require('./variantRuntimeService');

const SURFACE = Object.freeze([
  'configureHost', 'configureAdmission', 'configureResources',
  'configureImmunePolicy', 'configureTransmission', 'configureSuccession',
  'configureStopConditions', 'configurePlacement', 'configureMemory',
  'configureCompetition', 'configureTool', 'configureSynchronization'
]);

const PROCEDURAL = Object.freeze([
  'createSymbiosisContract', 'startSymbiontAdmission', 'evaluateSymbiontTrial'
]);

function surfaceReasons(policy) {
  const reasons = [];
  for (const method of SURFACE) {
    if (typeof policy[method] !== 'function') reasons.push(`surface_missing:${method}`);
    else if (policy[method]() === null || typeof policy[method]() !== 'object') reasons.push(`surface_empty:${method}`);
  }
  return reasons;
}

function operationReasons(policy) {
  const allowed = controller.OPERATIONS[policy.name] || [];
  const reasons = allowed
    .filter((operation) => typeof runtime[operation] !== 'function' && !PROCEDURAL.includes(operation))
    .map((operation) => `operation_unbound:${operation}`);
  if (!allowed.length) reasons.push('no_runtime_operations');
  return { allowed, reasons };
}

function verifiedSuccession(policy) {
  const succession = policy.configureSuccession();
  return succession.requireVerifiedReplacement === true
    || succession.coreReplacementRequiresApproval === true;
}

function gateReasons(policy) {
  const reasons = [];
  if (policy.configureAdmission().requireContract !== true) reasons.push('admission_without_contract');
  if (policy.configureAdmission().requireEvidence !== true) reasons.push('admission_without_evidence');
  if (policy.configureAdmission().trialRequired !== true) reasons.push('admission_without_trial');
  if (policy.configureImmunePolicy().rejectUnverified !== true) reasons.push('immune_gate_missing');
  if (!verifiedSuccession(policy)) reasons.push('succession_without_verified_replacement');
  if (policy.configureStopConditions().stopWhenHostRetired !== true) reasons.push('stop_closure_missing');
  if (!policy.configureResources().allocationMode) reasons.push('resource_quota_missing');
  return reasons;
}

function maturityFor(policy) {
  const operations = operationReasons(policy);
  const reasons = [...surfaceReasons(policy), ...operations.reasons, ...gateReasons(policy)];
  return {
    variantId: policy.name,
    maturity: reasons.length ? 'partial' : 'implemented',
    reasons,
    evidence: {
      operations: operations.allowed,
      admission: policy.configureAdmission(),
      immune: policy.configureImmunePolicy(),
      stopConditions: policy.configureStopConditions()
    }
  };
}

module.exports = { maturityFor, SURFACE };
