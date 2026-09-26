'use strict';

const nicheDiscovery = require('../niches/nicheDiscoveryService');
const nicheStore = require('../niches/nicheStore');
const { versionEnvironment } = require('../environment/environmentVersioning');
const { evaluateConstraints } = require('../environment/environmentalConstraintService');
const { buildOpportunityMap } = require('../environment/opportunityMapService');
const environmentGenerator = require('../../environmentGeneratorService');

function advance(ecology, state, input) {
  const context = prepareGeneration(state, input);
  const candidates = selectCandidates(context, input);
  const promoted = integrateCandidates({ ecology, candidates, context, input });
  const history = recordGeneration(state, ecology, promoted);
  return generationResult({ state, context, candidates, promoted, history });
}

function prepareGeneration(state, input) {
  const recent = (state.generationHistory || []).slice(-5);
  const sterileStreak = recent.every((item) => item.promoted === false) ? recent.length : 0;
  const threshold = Math.max(0, Math.min(1, Number.isFinite(input.noveltyThreshold) ? input.noveltyThreshold : 0.4));
  const pressure = input.allowGeneration === true && sterileStreak < 5;
  const generated = pressure ? generateChildren(state.environmentArchive || [], input) : [];
  const archive = [...(state.environmentArchive || []), ...generated].slice(-100);
  return { sterileStreak, threshold, pressure, generated, archive,
    outcomes: Array.isArray(input.environmentOutcomes) ? input.environmentOutcomes : [] };
}

function selectCandidates(context, input) {
  const evaluated = context.outcomes.map((outcome) => mergeOutcome(context.archive, outcome)).filter(Boolean);
  const supplied = Array.isArray(input.generatedEnvironments) ? input.generatedEnvironments : [];
  return boundedCandidates([...evaluated, ...supplied], context.threshold, input.evidenceRefs);
}

function mergeOutcome(archive, outcome) {
  const original = archive.find((item) => item.id === outcome.id);
  return original ? { ...original, ...outcome } : null;
}

function integrateCandidates(options) {
  const { ecology, candidates, context } = options;
  const opportunities = context.pressure ? candidates.map(toOpportunity) : [];
  const niches = nicheDiscovery.discoverNiches({ opportunityMap: opportunities, existingNiches: ecology.niches });
  ecology.niches = niches.reduce((current, niche) => nicheStore.upsertNiche(current, niche), ecology.niches);
  const promoted = niches.filter((item) => item.evidenceRefs.length && item.novelty >= context.threshold).map((item) => item.nicheId);
  const environment = selectEnvironment(candidates, promoted);
  if (environment) applyEnvironment(ecology, environment);
  return promoted;
}

function selectEnvironment(candidates, promoted) {
  return candidates.filter((item) => promoted.includes(`niche-${stableId(item.id)}`))
    .sort((a, b) => (b.utility - b.cost) - (a.utility - a.cost))[0];
}

function applyEnvironment(ecology, environment) {
  if (!environment.environment || typeof environment.environment !== 'object') return;
  const patch = { ...environment.environment, opportunities: environmentOpportunities(environment),
    unresolvedProblems: [...(ecology.environment.unresolvedProblems || []), environment.descriptor] };
  const updated = versionEnvironment({ environment: ecology.environment, patch,
    reason: 'bounded open-ended environment growth', evidenceRefs: strings(environment.evidenceRefs) });
  ecology.environment = updated.environment;
  ecology.environmentConstraints = evaluateConstraints(updated.environment).evaluations;
  ecology.opportunityMap = buildOpportunityMap(updated.environment);
}

function environmentOpportunities(environment) {
  return [...(environment.environment.opportunities || []), { id: environment.id, descriptor: environment.descriptor,
    opportunityScore: bounded(environment.utility), novelty: bounded(environment.novelty),
    evidenceRefs: strings(environment.evidenceRefs), justifiedUncertainty: bounded(environment.uncertainty) }];
}

function recordGeneration(state, ecology, promoted) {
  return [...(state.generationHistory || []), { promoted: promoted.length > 0, atTick: ecology.tick }].slice(-100);
}

function generationResult(options) {
  const { state, context, candidates, promoted, history } = options;
  const archive = context.archive.map((item) => ({ ...item, ...mergeOutcome(context.outcomes, item) }));
  return { state: { ...state, environmentArchive: archive, generationHistory: history },
    decision: { pressureApplied: context.pressure, sterileStreak: context.sterileStreak, candidates: candidates.length,
      promoted, rejected: candidates.length - promoted.length, threshold: context.threshold,
      generated: context.generated.map((item) => ({ id: item.id, archetype: item.archetype, difficulty: item.difficulty })) },
    action: { type: context.pressure ? 'BOUNDED_ENVIRONMENTS_EVALUATED' : 'OPEN_ENDED_PRESSURE_HALTED', status: 'applied', promoted: promoted.length } };
}

function boundedCandidates(value, threshold, evidenceRefs) {
  return (Array.isArray(value) ? value : []).slice(0, 20).filter((item) => validCandidate(item, threshold, evidenceRefs))
    .map((item, index) => ({ ...item, id: item.id || `poet-candidate-${index + 1}`, cost: Number(item.cost ?? 0) }));
}

function validCandidate(item, threshold, evidenceRefs) {
  if (!item || typeof item.descriptor !== 'string') return false;
  return hasProofOfValue(item, threshold, evidenceRefs);
}

function hasProofOfValue(item, threshold, evidenceRefs) {
  const cost = Number(item.cost ?? 0);
  return Number(item.novelty) >= threshold && strings(item.evidenceRefs || evidenceRefs).length > 0
    && Number(item.utility) > 0 && Number.isFinite(cost) && cost >= 0 && cost <= Number(item.utility);
}

function toOpportunity(item, index) {
  return { status: 'candidate', opportunityId: item.id || `poet-candidate-${index + 1}`,
    descriptor: item.descriptor, opportunityScore: bounded(item.utility), novelty: bounded(item.novelty),
    requiredCapabilities: strings(item.requiredCapabilities), resourceProfile: item.resourceProfile || {},
    evidenceRefs: strings(item.evidenceRefs), justifiedUncertainty: bounded(item.uncertainty), environmentPatch: item.environment };
}

function generateChildren(archive, input) {
  const archetype = environmentGenerator.ENVIRONMENT_ARCHETYPES[input.archetype]
    ? input.archetype : 'creative_exploration';
  const parent = archive.find((item) => item.archetype === archetype);
  const difficulty = Math.max(0.1, Math.min(0.9, Number(input.difficulty) || 0.3));
  const base = parent || environmentGenerator.createEnvironment(archetype, { difficulty });
  const operator = base.mutationOperators?.includes(input.mutationOperator) ? input.mutationOperator : base.mutationOperators?.[0];
  const child = environmentGenerator.mutateEnvironment(base, operator);
  child.difficulty = difficulty;
  child.constraints = { ...child.constraints, noveltyPressure: Math.max(0, Math.min(1, Number(input.noveltyPressure) || 0.5)) };
  const descriptor = `${child.label}: generation ${child.generation}`;
  return [{ ...child, descriptor, novelty: parent ? Math.abs(child.difficulty - parent.difficulty) + 0.25 : 1,
    environment: { boundaries: { archetype: child.archetype, difficulty: child.difficulty, parentId: child.parentId },
      resources: { difficulty: child.difficulty }, constraints: [], unresolvedProblems: [descriptor] } }];
}

function stableId(value) { return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64); }

function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }
function bounded(value) { return Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0; }

module.exports = { advance };
