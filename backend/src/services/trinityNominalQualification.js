'use strict';

const path = require('node:path');
const variantService = require('./trinityVariantService');
const qualificationTrace = require('./trinityQualificationTrace');
const { digest } = require('./trinityExecutionJournal');

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
  const reasons = [...identityFailures(input), ...worldFailures(variant, initial, experiment),
    ...initialReportFailures(initial, input.initialProof, input.comparisonProof),
    ...transitionFailures(experiment, input.transitions),
    ...gateFailures(variant, decision), ...comparisonFailures(input.comparisonProof, decision),
    ...promotionFailures(experiment, decision), ...promotedWorldFailures(worlds, initial, decision),
    ...candidateFailures(decision, signedObjectValid)];
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

function worldFailures(variant, initial, experiment) {
  const expected = variant === 'factorial' ? 16 : 3;
  if (initial.length !== expected || new Set(initial.map((world) => world.world_number)).size !== expected
    || initial.some((world) => !['promoted', 'compared', 'candidate'].includes(world.status))) {
    return ['initial_worlds_incomplete'];
  }
  const failures = [];
  const baseline = experiment?.mission_snapshot_hash;
  if (!/^[a-f0-9]{64}$/i.test(String(baseline || ''))
    || initial.some((world) => world.snapshot_hash !== baseline)) failures.push('sealed_baseline_mismatch');
  const roots = initial.map((world) => workspaceRoot(world.workspace_root));
  if (roots.some((root) => !root) || new Set(roots).size !== expected) failures.push('isolated_worlds_not_observed');
  return failures;
}

function initialReportFailures(worlds, initialProof, comparisonProof) {
  if (initialProof?.status !== 'verified') return ['initial_reports_journal_not_verified'];
  if (!initialProof.inputHash || initialProof.inputHash !== comparisonProof?.inputHash) {
    return ['initial_reports_comparison_mismatch'];
  }
  const reports = initialProof.reports;
  if (!Array.isArray(reports) || reports.length !== worlds.length) return ['initial_reports_worlds_mismatch'];
  const byNumber = new Map(reports.map((item) => [item.worldNumber, item]));
  if (byNumber.size !== worlds.length || worlds.some((world) => !matchesInitialReport(world, byNumber.get(world.world_number)))) {
    return ['initial_reports_worlds_mismatch'];
  }
  return [];
}

function matchesInitialReport(world, report) {
  return report?.agentId === world.agent_id && report?.report?.outcome === 'success'
    && !report.report.failure;
}

function workspaceRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return null;
  const root = path.resolve(value);
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

function transitionFailures(experiment, transitions = []) {
  const chain = ['designed', 'sealed_running', 'sealed_complete', 'cross_examining',
    'decided', 'promotion_preparing', 'promoted'];
  if (!Array.isArray(transitions) || transitions.length !== chain.length - 1) return ['promotion_trace_incomplete'];
  const valid = transitions.every((step, index) => step.from_status === chain[index]
    && step.to_status === chain[index + 1] && typeof step.actor === 'string' && step.actor.trim());
  if (!valid || transitions[0].evidence_ref !== experiment?.mission_snapshot_hash) return ['promotion_trace_incomplete'];
  return [];
}

function promotionFailures(experiment, decision) {
  return experiment?.status === 'promoted' && decision.outcome === 'PROMOTED' ? [] : ['promotion_not_observed'];
}

function promotedWorldFailures(worlds, initial, decision) {
  const promoted = worlds.filter((world) => world.status === 'promoted');
  return promoted.length === 1 && initial.includes(promoted[0])
    && promoted[0].world_number === decision.worldNumber
    && promoted[0].agent_id === decision.verification?.sourceAgentId
    ? [] : ['promoted_world_mismatch'];
}

function comparisonFailures(proof, decision) {
  if (proof?.status !== 'verified' || !proof.comparison || typeof proof.comparison !== 'object') {
    return ['comparison_journal_not_verified'];
  }
  if (proof.comparison.selectedWorld !== decision.worldNumber) return ['promoted_world_not_in_comparison'];
  const expected = qualificationTrace.fromComparison(proof.comparison?.comparativeAnalysis);
  return digest(expected) === digest(decision.variantGates || {}) ? [] : ['variant_gates_not_durable'];
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
