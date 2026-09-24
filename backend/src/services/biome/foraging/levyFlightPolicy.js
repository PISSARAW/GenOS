'use strict';

const distances = require('./semanticDistanceService');

const SPACE_WEIGHTS = {
  semantic: 0.24, source: 0.18, repository: 0.18,
  strategy: 0.14, capability: 0.14, representation: 0.12
};

function resolveMovement(alternatives, input) {
  const target = Array.isArray(alternatives)
    ? alternatives.filter((item) => item.available !== false)
      .map((item) => scoreCandidate(input, item))
      .sort((left, right) => right.score - left.score || left.patchId.localeCompare(right.patchId))[0]
    : null;
  const stagnation = Math.max(0, Number(input.stepsWithoutProgress) || 0);
  const jump = sampleJump(input.random);
  const useMacro = Boolean(target) && (stagnation >= 2 || jump > 5);
  let reason = 'local_exploitation_selected';
  if (useMacro) reason = stagnation >= 2 ? 'stagnation_triggered_domain_pivot' : 'levy_macro_jump_sampled';
  return { target, useMacro, reason, jump };
}

function planMovement(input = {}) {
  const { target, useMacro, reason, jump } = resolveMovement(input.alternatives, input);
  return {
    mode: useMacro ? 'LEVY_MACRO_JUMP' : 'LOCAL_INTENSIVE_EXPLOITATION',
    stepLength: jump,
    targetPatchId: target ? target.patchId : input.currentPatchId || null,
    operation: target ? target.operation : 'continue_current_patch',
    distances: target ? target.distances : null,
    score: target ? target.score : 0,
    reason
  };
}

function scoreCandidate(input, patch) {
  const patchId = String(patch.patchId || '').trim();
  const dist = semanticDistances(input.currentSpace || {}, patch.searchSpace || patch);
  const novelty = Math.max(0, finite(patch.expectedInformationGain, 0));
  const cost = Math.max(0, finite(patch.switchCost, 0));
  const risk = clamp01(patch.risk);
  return { patchId, operation: patch.operation || inferOperation(patch), distances: dist,
    score: novelty * (1 + weightedDistance(dist)) - cost - risk };
}

function weightedDistance(dist) {
  return Object.entries(SPACE_WEIGHTS).reduce((s, [k, w]) => s + (dist[k] || 0) * w, 0);
}

function semanticDistances(current, target) {
  return Object.fromEntries(Object.keys(SPACE_WEIGHTS)
    .map((space) => [space, distances.semanticDistance(current[space], target[space])]));
}

function inferOperation(patch) {
  return patch.source ? 'switch_source' : patch.repository ? 'inspect_repository'
    : patch.strategy ? 'switch_strategy' : patch.capability ? 'switch_capability'
      : patch.representation ? 'change_representation' : 'explore_domain';
}

function sampleJump(random = Math.random) {
  const draw = Math.max(0.0001, Math.min(0.9999, Number(random()) || 0.5));
  return Math.max(1, Math.round(Math.pow(draw, -1)));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

module.exports = { planMovement, semanticDistances };
