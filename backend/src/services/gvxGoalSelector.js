'use strict';

const SIGNAL_NAMES = Object.freeze([
  'projectNeed', 'trajectoryGap', 'risk', 'opportunity', 'uncertainty', 'learningProgress'
]);

const DEFAULT_WEIGHTS = Object.freeze({
  projectNeed: 0.24,
  trajectoryGap: 0.18,
  risk: 0.18,
  opportunity: 0.12,
  uncertainty: 0.1,
  learningProgress: 0.08,
  cost: 0.1
});

function validationError(message) {
  return Object.assign(new Error(message), { code: 'GVX_GOAL_SELECTION_INVALID' });
}

function validId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(value);
}

function validScope(scope) {
  return Boolean(scope?.organizationId && scope?.projectId);
}

function validControls(input) {
  return Number.isFinite(input.maxCost) && input.maxCost > 0
    && Number.isInteger(input.maxGoals) && input.maxGoals > 0
    && input.authority && typeof input.authority.isAllowed === 'function';
}

function validateInput(input) {
  if (!input || !validScope(input.scope) || !Array.isArray(input.candidates) || !validControls(input)) {
    throw validationError('GVX goal selection controls are incomplete.');
  }
}

function normalizedWeights(custom) {
  const weights = { ...DEFAULT_WEIGHTS, ...(custom || {}) };
  const names = [...SIGNAL_NAMES, 'cost'];
  if (names.some((name) => !Number.isFinite(weights[name]) || weights[name] < 0)) {
    throw validationError('GVX goal selection weights must be finite and non-negative.');
  }
  return weights;
}

function normalizeSignal(signal, name) {
  if (!signal || !Number.isFinite(signal.value) || signal.value < 0 || signal.value > 1
    || !Array.isArray(signal.sourceRefs) || signal.sourceRefs.length === 0
    || signal.sourceRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
    throw validationError(`Signal ${name} must carry a bounded value and source refs.`);
  }
  return { value: signal.value, sourceRefs: [...new Set(signal.sourceRefs)].sort() };
}

function normalizeCandidate(candidate) {
  if (!validId(candidate?.goalId) || !Number.isFinite(candidate.estimatedCost) || candidate.estimatedCost <= 0
    || typeof candidate.provenance?.candidateRef !== 'string'
    || typeof candidate.provenance?.observedAt !== 'string') {
    throw validationError('Each goal must have an id, positive cost and explicit provenance.');
  }
  const signals = Object.fromEntries(SIGNAL_NAMES.map((name) => [name, normalizeSignal(candidate.signals?.[name], name)]));
  return { goalId: candidate.goalId, estimatedCost: candidate.estimatedCost, signals,
    provenance: { candidateRef: candidate.provenance.candidateRef, observedAt: candidate.provenance.observedAt } };
}

function scoreCandidate(candidate, context) {
  const contributions = Object.fromEntries(SIGNAL_NAMES.map((name) => [name,
    Number((candidate.signals[name].value * context.weights[name]).toFixed(6))]));
  const costRatio = Math.min(1, candidate.estimatedCost / context.maxCost);
  const costPenalty = Number((costRatio * context.weights.cost).toFixed(6));
  const utility = Number((Object.values(contributions).reduce((sum, value) => sum + value, 0) - costPenalty).toFixed(6));
  return { contributions, costRatio, costPenalty, utility };
}

function evidenceRefs(candidate) {
  return [...new Set(SIGNAL_NAMES.flatMap((name) => candidate.signals[name].sourceRefs))].sort();
}

async function evaluateCandidate(candidate, context) {
  const allowed = await context.authority.isAllowed(candidate.goalId, {
    scope: context.scope, estimatedCost: candidate.estimatedCost, permission: 'goal:propose'
  });
  if (allowed !== true) return { ...candidate, status: 'permission_denied', eligible: false };
  if (candidate.estimatedCost > context.maxCost) return { ...candidate, status: 'budget_exceeded', eligible: false };
  const score = scoreCandidate(candidate, context);
  const eligible = score.utility > context.noChangeUtility && score.utility >= context.minUtility;
  return { ...candidate, status: eligible ? 'eligible' : 'no_change_dominates', eligible,
    score, evidenceRefs: evidenceRefs(candidate) };
}

function rank(left, right) {
  return right.score.utility - left.score.utility
    || left.estimatedCost - right.estimatedCost
    || left.goalId.localeCompare(right.goalId);
}

function selectWithinBudget(evaluations, context) {
  const selected = [];
  let remainingCost = context.maxCost;
  for (const item of evaluations.filter((entry) => entry.eligible).sort(rank)) {
    if (selected.length >= context.maxGoals || item.estimatedCost > remainingCost) continue;
    selected.push({ goalId: item.goalId, estimatedCost: item.estimatedCost, utility: item.score.utility,
      epistemicStatus: 'hypothesis', execution: 'requires_external_dispatch',
      promotion: 'requires_independent_evidence', evidenceRefs: item.evidenceRefs,
      provenance: item.provenance });
    remainingCost -= item.estimatedCost;
  }
  return { selected, remainingCost };
}

async function selectGoals(input) {
  validateInput(input);
  const context = { scope: input.scope, maxCost: input.maxCost, maxGoals: input.maxGoals,
    minUtility: Number.isFinite(input.minUtility) ? input.minUtility : 0,
    noChangeUtility: Number.isFinite(input.noChangeUtility) ? input.noChangeUtility : 0,
    weights: normalizedWeights(input.weights), authority: input.authority };
  const normalized = input.candidates.map(normalizeCandidate);
  const evaluations = [];
  for (const candidate of normalized) evaluations.push(await evaluateCandidate(candidate, context));
  const selection = selectWithinBudget(evaluations, context);
  const noChange = selection.selected.length === 0;
  return { schema: 'genos.gvx.goal-selection/v1', scope: { ...input.scope },
    decision: noChange ? 'NO_CHANGE' : 'PROPOSE_GOALS', status: noChange ? 'no_change' : 'proposed',
    selected: selection.selected, evaluations, remainingCost: selection.remainingCost,
    noChange: { utility: context.noChangeUtility, selected: noChange },
    autonomousExecution: false, promotionAuthorized: false,
    selectorVersion: 'gvx-goal-selector/1' };
}

module.exports = { DEFAULT_WEIGHTS, SIGNAL_NAMES, selectGoals };
