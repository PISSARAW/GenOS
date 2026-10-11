'use strict';

const variantService = require('./trinityVariantService');

const VARIANTS = Object.freeze(['controlled', 'heterogeneous', 'adversarial', 'counterfactual',
  'factorial', 'pareto', 'jury', 'recursive', 'adaptive', 'temporal', 'oracular', 'exploratory']);

function parse(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function gateFailures(variant, decision) {
  const gates = decision.variantGates || {};
  const expected = {
    heterogeneous: [['diversity', 'verified']], adversarial: [['adversarial', 'complete']],
    counterfactual: [['counterfactual', 'executed']],
    factorial: [['factorial', 'executed'], ['factorialTreatment', 'verified']],
    recursive: [['recursive', 'verified']], adaptive: [['adaptive', 'executed']],
    temporal: [['temporal', 'verified']], oracular: [['oracular', 'executed']],
    exploratory: [['exploratory', 'executed'], ['exploratoryReplicas', 'executed']]
  }[variant] || [];
  const failures = expected.filter(([name, status]) => gates[name]?.status !== status)
    .map(([name]) => `${name}_gate_not_observed`);
  if (variant === 'jury' && decision.jury?.status !== 'advisory') failures.push('jury_advice_not_observed');
  if (variant === 'pareto' && !decision.evidenceVectorDecision?.frontier?.length) failures.push('pareto_frontier_not_observed');
  return failures;
}

function assess(input) {
  const { variant, missionId, experiment, worlds = [], signedObjectValid } = input;
  const decision = parse(experiment?.decision_json);
  const initial = initialWorlds(variant, worlds);
  const reasons = [...identityFailures(input), ...worldFailures(variant, initial),
    ...gateFailures(variant, decision), ...promotionFailures(experiment, decision),
    ...candidateFailures(decision, signedObjectValid)];
  if (!initial.some((world) => world.agent_id === decision.verification?.sourceAgentId)) reasons.push('verified_source_world_missing');
  return { variant, missionId, qualified: reasons.length === 0, reasons,
    experimentStatus: experiment?.status || 'missing', observedGates: decision.variantGates || {} };
}

function identityFailures(input) {
  const failures = [];
  if (!VARIANTS.includes(input.variant)) failures.push('unknown_variant');
  if (input.experiment?.mission_id !== input.missionId) failures.push('experiment_missing');
  const selection = parse(input.dispatch?.variant_selection_json);
  if (selection.variant !== input.variant && selection.selectedPreset !== input.variant) failures.push('variant_selection_mismatch');
  const preset = variantService.DEFINITIONS[input.variant]?.design;
  if (preset && Object.entries(preset).some(([axis, policy]) => selection.experimentalDesign?.[axis] !== policy)) {
    failures.push('variant_design_mismatch');
  }
  return failures;
}

function initialWorlds(variant, worlds) {
  const expected = variant === 'factorial' ? 16 : 3;
  return worlds.filter((world) => world.world_number >= 1 && world.world_number <= expected);
}

function worldFailures(variant, initial) {
  const expected = variant === 'factorial' ? 16 : 3;
  if (initial.length !== expected || new Set(initial.map((world) => world.world_number)).size !== expected
    || initial.some((world) => !['promoted', 'compared', 'candidate'].includes(world.status))) {
    return ['initial_worlds_incomplete'];
  }
  return [];
}

function promotionFailures(experiment, decision) {
  return experiment?.status === 'promoted' && decision.outcome === 'PROMOTED' ? [] : ['promotion_not_observed'];
}

function candidateFailures(decision, signedObjectValid) {
  const reasons = [];
  const verification = decision.verification || {};
  if (!verification.contentHash || verification.claimsCoveredByChecks !== true
    || !Array.isArray(verification.integrationChecks) || !verification.integrationChecks.length
    || verification.integrationChecks.some((check) => check.passed !== true)) reasons.push('candidate_checks_missing');
  if (!decision.agentGit?.objectId || signedObjectValid !== true) reasons.push('signed_candidate_missing');
  return reasons;
}

module.exports = { VARIANTS, assess };
