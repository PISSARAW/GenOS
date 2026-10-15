'use strict';

const { TOPOLOGIES } = require('./topologyResolverService');
const workerKindService = require('../agents/workerKindService');

const MAX_INPUT = 100;
const MAX_OUTPUT = 50;
const WEIGHTS = Object.freeze({ problemFit: 0.32, capabilityFit: 0.2,
  budgetFit: 0.16, operationalFit: 0.14, coordinationEfficiency: 0.18 });

function unit(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function recipeList(input) {
  return (Array.isArray(input.candidates) ? input.candidates : [])
    .slice(0, MAX_INPUT).filter(item => item && typeof item === 'object');
}

function isNoChangeRecipe(recipe) {
  return recipe.isNoChange === true || recipe.kind === 'NO_CHANGE' || recipe.candidateId === 'no-change';
}

function baselineRecipe(input) {
  const baseline = input.baseline || {};
  return {
    ...baseline,
    id: 'NO_CHANGE',
    topology: baseline.topology || input.currentTopology || null,
    workerKinds: list(baseline.workerKinds || input.currentWorkerKinds),
    requiredCapabilities: list(baseline.requiredCapabilities),
    estimatedTokens: Number.isFinite(Number(baseline.estimatedTokens)) ? Number(baseline.estimatedTokens) : 0,
    coordinationCost: Number.isFinite(Number(baseline.coordinationCost)) ? Number(baseline.coordinationCost) : 0.5,
    estimatedProblemFit: Number.isFinite(Number(baseline.estimatedProblemFit))
      ? Number(baseline.estimatedProblemFit) : 0.5,
    operationalFit: Number.isFinite(Number(baseline.operationalFit)) ? Number(baseline.operationalFit) : 0.5,
    confidence: Number.isFinite(Number(baseline.confidence)) ? Number(baseline.confidence) : 1,
    isNoChange: true
  };
}

function signalsOf(input) {
  const diagnosis = input.diagnosis || input.profile || {};
  return Object.fromEntries(Object.entries(diagnosis).filter(([, value]) => Number.isFinite(Number(value)))
    .map(([key, value]) => [key, unit(value)]));
}

function buildContext(input) {
  const constraints = input.operationalConstraints || {};
  const priorityWeights = normalizedWeights(input.priorityWeights);
  return {
    budget: Math.max(0, Number(input.budget?.tokens) || 0),
    capabilities: new Set(list(input.availableCapabilities)),
    workerKinds: new Set(list(input.availableWorkerKinds)),
    signals: signalsOf(input),
    constraints,
    hasCapabilityInventory: Array.isArray(input.availableCapabilities),
    hasWorkerInventory: Array.isArray(input.availableWorkerKinds),
    minImprovement: unit(input.minImprovement, 0.05),
    minConfidence: unit(input.minConfidence, 0.55),
    weights: priorityWeights || WEIGHTS,
    allowScalarTieBreak: input.allowScalarTieBreak === true || priorityWeights !== null
  };
}

function normalizedWeights(value) {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(WEIGHTS).map(([key]) => [key, Number(value[key])]);
  if (entries.some(([, weight]) => !Number.isFinite(weight) || weight < 0)) return null;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return total > 0 ? Object.fromEntries(entries.map(([key, weight]) => [key, weight / total])) : null;
}

function problemFit(recipe, signals) {
  if (Number.isFinite(Number(recipe.estimatedProblemFit))) return unit(recipe.estimatedProblemFit);
  const affinity = recipe.affinity;
  const entries = Object.entries(signals).filter(([key]) => Number.isFinite(Number(affinity?.[key])));
  if (!entries.length) return 0.5;
  return entries.reduce((sum, [key, value]) => sum + (1 - Math.abs(value - unit(affinity[key]))), 0) / entries.length;
}

function capabilityAssessment(recipe, context) {
  const required = [...new Set(list(recipe.requiredCapabilities))];
  const kinds = [...new Set(list(recipe.workerKinds))];
  const missing = context.hasCapabilityInventory
    ? required.filter(capability => !context.capabilities.has(capability)) : [];
  const missingKinds = kinds.filter(kind => !Object.hasOwn(workerKindService.KINDS, kind)
    || (context.hasWorkerInventory && !context.workerKinds.has(kind)));
  const fit = !context.hasCapabilityInventory ? 0.5
    : required.length ? (required.length - missing.length) / required.length : 1;
  return { required, kinds, missing, missingKinds, fit };
}

function budgetVeto(recipe, context) {
  const tokens = Number(recipe.estimatedTokens);
  if (recipe.estimatedTokens === undefined || recipe.estimatedTokens === null) return null;
  if (!Number.isFinite(tokens) || tokens < 0) return 'estimatedTokens must be finite and non-negative';
  return tokens > context.budget ? `budget exceeded: ${tokens} > ${context.budget}` : null;
}

function inventoryVetos(assessment) {
  const reasons = [];
  if (assessment.missing.length) reasons.push(`missing capabilities: ${assessment.missing.join(', ')}`);
  if (assessment.missingKinds.length) reasons.push(`worker kinds unavailable: ${assessment.missingKinds.join(', ')}`);
  return reasons;
}

function operationVetos(recipe, context, assessment) {
  const constraints = context.constraints;
  const reasons = [];
  if (list(constraints.forbiddenTopologies).includes(recipe.topology)) reasons.push(`topology forbidden: ${recipe.topology}`);
  if (constraints.daemonAllowed === false && recipe.requiresDaemon === true) reasons.push('daemon operation is not allowed');
  if (constraints.parallelAllowed === false && recipe.requiresParallel === true) reasons.push('parallel operation is not allowed');
  if (Number.isFinite(Number(constraints.maxWorkers)) && assessment.kinds.length > Number(constraints.maxWorkers)) {
    reasons.push(`worker limit exceeded: ${assessment.kinds.length} > ${constraints.maxWorkers}`);
  }
  return reasons;
}

function vetoReasons(recipe, context, assessment) {
  const admission = [];
  if (recipe.executionEligible === false) admission.push('executionEligible is false');
  if (recipe.admissibility !== undefined && !['eligible', 'execution_eligible'].includes(admissibilityValue(recipe))) {
    admission.push(`admissibility is ${admissibilityValue(recipe)}`);
  }
  if (recipe.validation?.valid === false) admission.push('validation.valid is false');
  return [...admission, budgetVeto(recipe, context), ...inventoryVetos(assessment), ...operationVetos(recipe, context, assessment)]
    .filter(Boolean);
}

function admissibilityValue(recipe) {
  const admission = recipe.admissibility;
  return typeof admission === 'object' ? admission.status || admission.state || 'unknown' : admission;
}

function maturityAssessment(recipe) {
  if (isNoChangeRecipe(recipe)) return { known: true, proposalEligible: true, value: 'current' };
  const maturity = recipe.maturity;
  const value = typeof maturity === 'string' ? maturity : maturity?.variant;
  const mature = value === 'implemented' || value === 'stable';
  return { known: typeof value === 'string' && value.length > 0, proposalEligible: mature,
    value: value || 'unknown' };
}

function coordinationCost(recipe, assessment) {
  const explicit = Number(recipe.coordinationCost);
  const topologyCost = TOPOLOGIES[recipe.topology]?.coordination_overhead;
  const base = Number.isFinite(explicit) ? unit(explicit)
    : Number.isFinite(topologyCost) ? unit(topologyCost)
      : Math.min(1, Math.max(0, assessment.kinds.length - 1) / 5);
  return unit(base + (recipe.isComposite === true ? 0.15 : 0));
}

function budgetEfficiency(recipe, context) {
  if (recipe.estimatedTokens === undefined || recipe.estimatedTokens === null) return 0.5;
  const tokens = Math.max(0, Number(recipe.estimatedTokens) || 0);
  if (context.budget === 0) return tokens === 0 ? 1 : 0;
  return unit(1 - tokens / context.budget);
}

function scoreComponents(recipe, context, assessment) {
  const coordCost = recipe.isNoChange ? 0 : coordinationCost(recipe, assessment);
  return {
    problemFit: problemFit(recipe, context.signals),
    capabilityFit: recipe.isNoChange && !recipe.requiredCapabilities?.length ? 0.5 : assessment.fit,
    budgetFit: recipe.isNoChange && recipe.estimatedTokens === 0 ? 0.5 : budgetEfficiency(recipe, context),
    operationalFit: unit(recipe.operationalFit, 0.5),
    coordinationEfficiency: 1 - coordCost
  };
}

function maturityReasons(recipe) {
  const maturity = maturityAssessment(recipe);
  if (!maturity.known) return ['candidate maturity unknown; treat ranking as uncertain'];
  return maturity.proposalEligible ? [] : [`maturity ${maturity.value} cannot be proposed`];
}

function unknownReasons(recipe, context, assessment) {
  const reasons = [];
  if (!context.hasCapabilityInventory) reasons.push('capability inventory unavailable');
  if (!context.hasWorkerInventory && assessment.kinds.length) reasons.push('worker inventory unavailable');
  if (!Number.isFinite(Number(recipe.confidence)) && !isNoChangeRecipe(recipe)) reasons.push('candidate confidence not supplied');
  if (!Number.isFinite(Number(recipe.estimatedProblemFit)) && !recipe.affinity) reasons.push('problem fit is a neutral prior');
  reasons.push(...maturityReasons(recipe));
  if (recipe.estimatedTokens === undefined || recipe.estimatedTokens === null) reasons.push('budget estimate unavailable');
  return reasons;
}

function scoreRecipe(recipe, context) {
  const assessment = capabilityAssessment(recipe, context);
  const maturity = maturityAssessment(recipe);
  const baseline = isNoChangeRecipe(recipe);
  const vetoes = baseline ? [] : vetoReasons(recipe, context, assessment);
  const components = scoreComponents(recipe, context, assessment);
  const weighted = Object.fromEntries(Object.entries(components)
    .map(([key, value]) => [key, Number((value * context.weights[key]).toFixed(4))]));
  const score = Object.values(weighted).reduce((sum, value) => sum + value, 0);
  const confidence = baseline ? 1 : Math.min(unit(recipe.confidence, 0.35), maturity.known ? 1 : 0.35);
  const calibrated = recipe.calibrationStatus === 'calibrated' && hasNonNeutralFit(recipe);
  return {
    id: recipe.id || recipe.candidateId || recipe.topology || 'unnamed', topology: recipe.topology || null,
    variant: recipe.variant || null, score: Number(score.toFixed(4)), scoreComponents: weighted,
    estimates: components, confidence, uncertainty: Number((1 - confidence).toFixed(4)),
    vetoes, reasons: [...unknownReasons(recipe, context, assessment), ...vetoes], eligible: vetoes.length === 0,
    proposalEligible: maturity.proposalEligible, maturity: maturity.value,
    calibrated,
    isNoChange: baseline,
    pareto: false, dominatedBy: []
  };
}

function hasNonNeutralFit(recipe) {
  if (Number.isFinite(Number(recipe.estimatedProblemFit))) return unit(recipe.estimatedProblemFit) !== 0.5;
  return Object.values(recipe.affinity || {}).some(value => unit(value, 0.5) !== 0.5);
}

function objectiveValues(item) {
  return [item.estimates.problemFit, item.estimates.capabilityFit, item.estimates.budgetFit,
    item.estimates.operationalFit, item.estimates.coordinationEfficiency];
}

function dominates(left, right) {
  const a = objectiveValues(left);
  const b = objectiveValues(right);
  return a.every((value, index) => value >= b[index]) && a.some((value, index) => value > b[index]);
}

function markPareto(items) {
  return items.map(item => {
    const dominators = items.filter(other => other !== item && other.eligible && dominates(other, item));
    return { ...item, pareto: item.eligible && dominators.length === 0,
      dominatedBy: dominators.map(other => other.id) };
  });
}

function noAlternativeDecision(items) {
  if (items.some(item => item.eligible && !item.isNoChange)) return { decision: 'ABSTAIN', selectedId: null,
    reason: 'No candidate with sufficiently known, implemented or stable maturity is eligible to propose.' };
  return { decision: 'NO_CHANGE', selectedId: 'NO_CHANGE', reason: 'No eligible recipe improves on the baseline.' };
}

function tradeoffDecision(items, context) {
  if (!context.allowScalarTieBreak) {
    const pareto = items.filter(item => item.eligible && item.proposalEligible && item.pareto);
    if (pareto.length > 1) return { decision: 'ABSTAIN', selectedId: null,
      reason: 'Multiple non-dominated candidates trade off; no mission priority authorizes scalar tie-breaking.' };
  }
  return null;
}

function qualityDecision(best, baseline, context) {
  if (best.confidence < context.minConfidence) return { decision: 'ABSTAIN', selectedId: null,
    reason: `Best candidate confidence ${best.confidence} is below ${context.minConfidence}.` };
  if (!best.calibrated) return { decision: 'ABSTAIN', selectedId: null,
    reason: 'Estimates are neutral or lack an explicit calibration declaration; cannot propose this candidate.' };
  if (best.score - baseline.score < context.minImprovement) return { decision: 'ABSTAIN', selectedId: null,
    reason: `Estimated gain is below ${context.minImprovement}; preserve NO_CHANGE.` };
  return null;
}

function selectRecommendation(items, context) {
  const baseline = items.find(item => item.isNoChange);
  const alternatives = items.filter(item => item.eligible && item.proposalEligible && !item.isNoChange)
    .sort((a, b) => b.score - a.score);
  const best = alternatives[0];
  if (!best) return noAlternativeDecision(items);
  const gate = tradeoffDecision(items, context) || qualityDecision(best, baseline, context);
  if (gate) return gate;
  return { decision: 'PROPOSE', selectedId: best.id,
    reason: 'Highest estimated score clears confidence and improvement thresholds; this is not an execution authorization.' };
}

function rankAdaptiveTopologies(input = {}) {
  const context = buildContext(input);
  const supplied = recipeList(input).filter(recipe => !isNoChangeRecipe(recipe));
  const recipes = [baselineRecipe({ ...input, baseline: input.baseline || recipeList(input).find(isNoChangeRecipe) }),
    ...supplied.map((recipe, index) => ({ ...recipe,
      id: recipe.id || recipe.candidateId || `${recipe.topology || 'candidate'}:${recipe.variant || index}`,
      isComposite: recipe.isComposite === true || recipe.kind === 'NESTED' || (Array.isArray(recipe.members) && recipe.members.length > 1)
    }))];
  const unique = recipes.filter((item, index) => recipes.findIndex(other => other.id === item.id) === index);
  const scored = markPareto(unique.map(recipe => scoreRecipe(recipe, context)));
  const sorted = scored.sort((a, b) => Number(b.eligible) - Number(a.eligible)
    || Number(b.pareto) - Number(a.pareto) || b.score - a.score);
  const limit = Math.max(1, Math.min(MAX_OUTPUT, Math.floor(Number(input.limit) || 20)));
  const pareto = sorted.filter(item => item.pareto);
  const retained = [...pareto, ...sorted.filter(item => !item.pareto)].slice(0, limit);
  const decision = selectRecommendation(scored, context);
  return {
    schemaVersion: 1, kind: 'adaptive_topology_ranking_advisory', decision,
    candidates: retained.map((item, index) => ({ ...item, rank: index + 1 })),
    vetoed: scored.filter(item => !item.eligible).map(item => ({ id: item.id, reasons: item.vetoes })),
    consideredCount: scored.length, truncatedCount: Math.max(0, scored.length - retained.length),
    scoreWeights: context.weights, executionAuthorized: false,
    caveat: 'Scores are heuristic estimates supplied or derived from caller inputs; no outcome or execution is asserted.'
  };
}

module.exports = { rankAdaptiveTopologies };
