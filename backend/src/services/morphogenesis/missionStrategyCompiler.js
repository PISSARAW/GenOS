'use strict';

const { DEFINITIONS } = require('./registry/topologyRegistry');
const workerKinds = require('../agents/workerKindService');
const { generateAdaptiveTopologyCandidates } = require('./adaptiveTopologyCandidates');
const { rankAdaptiveTopologies } = require('./adaptiveTopologyRanking');
const { buildAdaptiveWorkerRoster } = require('./adaptiveWorkerRoster');

const PHASES = Object.freeze([
  { id: 'observation', signal: 'uncertainty', threshold: 0, share: 0.2,
    methods: ['scan_literal', 'monitor_samples'],
    evidence: 'observations référencees et incertitudes explicites' },
  { id: 'causal_hypothesis', signal: 'causalAmbiguity', threshold: 0.35, share: 0.2,
    methods: ['trace_declared_causes'],
    evidence: 'hypothèse falsifiable et causes concurrentes' },
  { id: 'deterministic_execution', signal: 'deterministicNeed', threshold: 0.35, share: 0.25,
    methods: ['lpt', 'formal_proof'],
    evidence: 'reçu du solveur ou certificat lié au résultat exact' },
  { id: 'adversarial_verification', signal: 'adversarialRisk', threshold: 0.35, share: 0.2,
    methods: ['falsify_procedure', 'verify_procedure'],
    evidence: 'contre-exemple reproductible ou rapport indépendant' },
  { id: 'continuous_monitoring', signal: 'monitoringNeed', threshold: 0.35, share: 0.15,
    methods: ['monitor_samples'],
    evidence: 'observations horodatées liées au périmètre surveillé' }
]);

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function diagnose(profile = {}) {
  const signals = {
    uncertainty: bounded(profile.uncertainty),
    causalAmbiguity: bounded(profile.causalAmbiguity),
    deterministicNeed: bounded(profile.deterministicNeed),
    adversarialRisk: bounded(profile.adversarialRisk),
    monitoringNeed: bounded(profile.monitoringNeed)
  };
  const dominant = Object.entries(signals).sort((a, b) => b[1] - a[1])[0];
  return { signals, dominant: dominant[1] > 0 ? dominant[0] : 'unspecified', confidence: dominant[1] };
}

function availableKinds(assignments) {
  const kinds = new Set();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const kind = typeof assignment === 'string' ? assignment : assignment?.workerKind || assignment?.kind;
    if (typeof kind === 'string' && Object.hasOwn(workerKinds.KINDS, kind)) kinds.add(kind);
  }
  return kinds;
}

function phaseState(requested, chosen, allocation) {
  if (!requested) return 'conditional';
  return chosen && allocation > 0 ? 'proposed' : 'blocked';
}

function blockedReason(options, status) {
  if (status !== 'blocked') return null;
  return options.flatMap(option => option.reasons || []).filter(Boolean).join('; ') || 'budget unavailable';
}

function compilePhase(definition, context, rosterPhase) {
  const requested = context.diagnostic.signals[definition.signal] >= definition.threshold;
  const options = rosterPhase?.options || [];
  const chosen = rosterPhase?.retained?.[0] || null;
  const fallback = rosterPhase?.retained?.[1] || null;
  const allocation = Math.floor(context.budgetTokens * definition.share);
  const status = phaseState(requested, chosen, allocation);
  const active = status === 'proposed';
  const maxTokens = active ? allocation : 0;
  return {
    id: definition.id,
    when: { signal: definition.signal, atLeast: definition.threshold },
    status,
    workerKind: active ? chosen.workerKind : null,
    methodContract: active ? { version: 1, methodId: chosen.methodId } : null,
    fallback: active && fallback ? { workerKind: fallback.workerKind,
      methodContract: { version: 1, methodId: fallback.methodId } } : null,
    alternatives: options.map((option, index) => ({ ...option, priority: index + 1 })),
    bounds: { maxTokens, maxAttempts: 1, stopOn: ['verified_evidence', 'budget_exhausted', 'lease_expired'] },
    evidenceRequired: definition.evidence,
    execution: 'advisory_only',
    reason: blockedReason(options, status),
    daemonStatus: rosterPhase?.daemonStatus || 'not_targeted'
  };
}

function requestedPhases(context) {
  return PHASES.map(phase => ({ id: phase.id,
    requested: context.diagnostic.signals[phase.signal] >= phase.threshold,
    methods: phase.methods }));
}

function workerRoster(input, context) {
  return buildAdaptiveWorkerRoster({
    phases: requestedPhases(context),
    workerAssignments: input.workerAssignments,
    runtimeSnapshot: input.runtimeSnapshot,
    availableCapabilities: Array.isArray(input.availableCapabilities) ? input.availableCapabilities : undefined,
    daemonAllowed: input.operationalConstraints?.daemonAllowed
  });
}

function resolutionRoles(phases) {
  return (Array.isArray(phases) ? phases : [])
    .filter((phase) => phase && phase.status === 'proposed' && phase.workerKind)
    .map((phase) => ({ roleId: phase.id, workerKind: phase.workerKind,
      methodId: phase.methodContract?.methodId || null }));
}

function resourceResolution(input, phases) {
  try {
    return require('./runtimeResourceResolution').resolveRuntimeResources({
      roles: resolutionRoles(phases),
      freeWorkerPool: input.freeWorkerPool || null,
      daemonInventory: input.daemonInventory || null,
      daemonAllowed: input.operationalConstraints?.daemonAllowed,
      observedAt: input.observedAt,
      now: input.now
    });
  } catch (_) {
    return { schemaVersion: 1, kind: 'runtime_resource_resolution', status: 'UNKNOWN',
      roles: [], missing: ['resolution_failed'], reasons: ['resolution_failed'],
      executionAuthorized: false, revalidationRequired: true };
  }
}

function inputErrors(mission, selectedTopology, budgetTokens) {
  const errors = [];
  if (!mission) errors.push('mission required');
  if (!Object.hasOwn(DEFINITIONS, selectedTopology)) errors.push('unknown topology');
  if (!Number.isFinite(budgetTokens) || budgetTokens < 0) errors.push('finite non-negative token budget required');
  return errors;
}

function compilationContext(input, budgetTokens) {
  return {
    diagnostic: diagnose(input.profile),
    budgetTokens: Number.isFinite(budgetTokens) && budgetTokens > 0 ? Math.floor(budgetTokens) : 0,
    kinds: availableKinds(input.workerAssignments)
  };
}

function topologyPortfolio(input, context) {
  if (!Object.hasOwn(DEFINITIONS, input.selectedTopology)) return { status: 'unavailable', reason: 'selected topology is unknown' };
  try {
    const generated = generateAdaptiveTopologyCandidates({
      selectedTopology: input.selectedTopology,
      selectedVariant: input.selectedVariant,
      currentRecipe: input.currentRecipe,
      availableTopologyCapabilities: input.availableTopologyCapabilities,
      mission: input.mission,
      missionId: input.missionId,
      budget: input.budget,
      relationContext: input.relationContext,
      adapterRegistry: input.adapterRegistry
    });
    return rankedPortfolio({ input, context, generated });
  } catch (error) {
    return { status: 'unavailable', reason: error.code || error.message };
  }
}

function rankedPortfolio(options) {
  const { input, context, generated } = options;
  const ranking = rankAdaptiveTopologies({
    candidates: generated.candidates,
    currentTopology: input.selectedTopology,
    currentWorkerKinds: [...context.kinds],
    availableWorkerKinds: [...context.kinds],
    availableCapabilities: input.availableTopologyCapabilities,
    diagnosis: input.profile,
    budget: input.budget,
    operationalConstraints: input.operationalConstraints,
    priorityWeights: input.priorityWeights,
    allowScalarTieBreak: input.allowScalarTieBreak,
    calibrationStatus: input.calibrationStatus
  });
  return { status: 'advisory', generation: generated.stats, ranking };
}

function compileMissionStrategy(input = {}) {
  const mission = typeof input.mission === 'string' ? input.mission.trim() : '';
  const selectedTopology = String(input.selectedTopology || '');
  const budgetTokens = Number(input.budget?.tokens);
  const errors = inputErrors(mission, selectedTopology, budgetTokens);
  const context = compilationContext(input, budgetTokens);
  const roster = workerRoster(input, context);
  const phases = PHASES.map(definition => compilePhase(definition, context,
    roster.phases.find(phase => phase.id === definition.id)));
  const status = errors.length || phases.some(phase => phase.status === 'blocked') ? 'blocked' : 'proposed';
  return {
    schemaVersion: 1,
    kind: 'mission_strategy_advisory',
    status,
    mission,
    selectedTopology: Object.hasOwn(DEFINITIONS, selectedTopology) ? selectedTopology : null,
    diagnostic: context.diagnostic,
    phases,
    workerRoster: roster,
    runtimeResources: input.runtimeSnapshot || { status: 'unknown', workers: [], reason: 'runtime_snapshot_not_provided' },
    resourceResolution: resourceResolution(input, phases),
    topologyPortfolio: topologyPortfolio(input, context),
    bounds: { maxTokens: context.budgetTokens, maxTransitions: 0, executionAuthorized: false },
    evidencePolicy: { transportIsNotSuccess: true, promotionRequiresVerifiedReceipt: true,
      resourceRevalidationRequired: true },
    errors,
    alternatives: status === 'blocked' ? ['supply missing capability or worker kind', 'request an admissible topology and budget'] : []
  };
}

module.exports = { compileMissionStrategy };
