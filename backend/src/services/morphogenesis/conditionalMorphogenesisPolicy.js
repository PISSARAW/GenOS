'use strict';

const { generateAdaptiveTopologyCandidates } = require('./adaptiveTopologyCandidates');
const { rankAdaptiveTopologies } = require('./adaptiveTopologyRanking');
const { buildAdaptiveWorkerRoster } = require('./adaptiveWorkerRoster');
const selectorCalibration = require('./morphogenesisSelectorCalibration');
const communicationReduction = require('./communicationReductionIntervention');

const MAX_EPOCHS = 12;
const SIGNALS = Object.freeze(['uncertainty', 'causalAmbiguity', 'contradiction',
  'provenanceRisk', 'deterministicNeed', 'adversarialRisk', 'monitoringNeed', 'stagnation']);
const REPRESENTATIONS = Object.freeze(['task_graph', 'hypothesis_set', 'causal_graph',
  'provenance_graph', 'constraint_graph']);

function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function normalizedSignals(value = {}) {
  return Object.fromEntries(SIGNALS.map(key => [key, unit(value[key])]));
}

function representationFor(signals) {
  const ranked = [
    ['provenance_graph', signals.provenanceRisk],
    ['hypothesis_set', Math.max(signals.uncertainty, signals.contradiction)],
    ['causal_graph', signals.causalAmbiguity],
    ['constraint_graph', signals.deterministicNeed],
    ['task_graph', 0]
  ];
  ranked.sort((left, right) => right[1] - left[1]);
  if (ranked[0][1] === 0) return { kind: 'task_graph', confidence: 0, alternatives: ranked.slice(0, -1).map(item => item[0]) };
  return { kind: ranked[0][0], confidence: ranked[0][1], alternatives: ranked.slice(1).map(item => item[0]) };
}

function phasesFor(signals) {
  const phases = [
    { id: 'observe', signal: 'uncertainty', methods: ['scan_literal', 'monitor_samples'] },
    { id: 'causal_diagnosis', signal: 'causalAmbiguity', methods: ['trace_declared_causes'] },
    { id: 'solve', signal: 'deterministicNeed', methods: ['lpt', 'formal_proof'] },
    { id: 'falsify', signal: 'adversarialRisk', methods: ['falsify_procedure', 'verify_procedure'] },
    { id: 'monitor', signal: 'monitoringNeed', methods: ['monitor_samples'] }
  ];
  return phases.map(phase => ({ ...phase, requested: signals[phase.signal] >= 0.35 }));
}

function proofObligations(signals, representation) {
  const obligations = [{ id: 'resolution', required: true,
    proof: 'reçu indépendant lié au périmètre et à la version du résultat' }];
  if (signals.provenanceRisk >= 0.35) obligations.push({ id: 'source_independence', required: true,
    proof: 'observation indépendante de la source contestée' });
  if (signals.adversarialRisk >= 0.35 || signals.contradiction >= 0.35) {
    obligations.push({ id: 'counterexample_search', required: true,
      proof: 'contre-exemple reproductible ou vérification adversariale indépendante' });
  }
  if (representation.kind === 'causal_graph') obligations.push({ id: 'causal_falsifier', required: true,
    proof: 'hypothèse causale et prédiction falsifiable observée' });
  return obligations;
}

function buildRecipePortfolio(input, signals) {
  const calibration = selectorCalibration.compileCalibration(input.verifiedOutcomes);
  const replacement = calibration.scales.COHORT_REPLACEMENT;
  const generated = generateAdaptiveTopologyCandidates(candidateGenerationInput(input));
  const topologyCandidates = decorateCandidates({ candidates: generated.candidates, replacement, signals, input });
  const communication = communicationReduction.describeAvailability(input.communicationMission, input.communicationMetric);
  const communicationCandidate = communicationCandidateFor(communication, calibration);
  const candidates = communication.status === 'available'
    ? [...topologyCandidates, communicationCandidate] : topologyCandidates;
  const ranking = rankPortfolio(topologyCandidates, input, signals);
  const availableScales = replaceableCandidates(generated.candidates);
  if (communication.status === 'available') availableScales.push({
    candidateId: communication.candidateId, scale: communication.scale
  });
  const scaleDecision = selectorCalibration.selectScale(calibration, availableScales);
  const selected = selectedCandidate({ ranking, scaleDecision, communicationCandidate });
  return { generation: generated.stats, candidates, ranking, calibration, communication,
    scaleDecision, selected: selectionSummary(selected, input, scaleDecision) };
}

function communicationCandidateFor(availability, calibration) {
  const estimate = calibration.scales.COMMUNICATION_REDUCTION.candidates[availability.candidateId] || { status: 'unavailable' };
  return { id: availability.candidateId, candidateId: availability.candidateId,
    kind: 'COMMUNICATION_REDUCTION', topology: null, variant: null,
    admissibility: 'available', runtimeAvailability: availability,
    ...candidateCalibrationAttributes(false, estimate), interventionScale: 'COMMUNICATION_REDUCTION' };
}

function selectedCandidate(context) {
  const { ranking, scaleDecision, communicationCandidate } = context;
  if (scaleDecision.scale === 'COMMUNICATION_REDUCTION'
    && scaleDecision.candidateId === communicationCandidate?.candidateId) return communicationCandidate;
  return admittedSelection(ranking, scaleDecision);
}

function candidateGenerationInput(input) {
  return {
    selectedTopology: input.currentTopology,
    selectedVariant: input.currentVariant,
    currentRecipe: input.currentRecipe,
    availableTopologyCapabilities: input.availableTopologyCapabilities,
    mission: input.mission,
    missionId: input.missionId,
    budget: input.budget,
    maxCandidates: input.maxCandidates,
    relationContext: input.relationContext,
    adapterRegistry: input.adapterRegistry
  };
}

function decorateCandidates(context) {
  return context.candidates.map(candidate => decorateCandidate({ ...context, candidate }));
}

function decorateCandidate(context) {
  const { candidate, replacement, signals, input } = context;
  const unchanged = candidate.kind === 'NO_CHANGE';
  const estimate = replacement.candidates?.[candidate.candidateId] || { status: 'unavailable' };
  return {
    ...candidate,
    id: candidate.candidateId,
    estimatedTokens: unchanged ? 0 : estimateCost(candidate, input),
    estimatedProblemFit: problemFit(candidate, signals),
    ...candidateCalibrationAttributes(unchanged, estimate)
  };
}

function candidateCalibrationAttributes(unchanged, estimate) {
  if (unchanged) return { confidence: 1, calibrationStatus: 'baseline',
    interventionScale: 'NO_CHANGE', expectedGain: 0, gainUncertainty: 0,
    marginalCost: 0, costUncertainty: 0 };
  return { confidence: estimate.status === 'calibrated' ? 1 - estimate.gainUncertainty : 0.35,
    calibrationStatus: estimate.status, interventionScale: 'COHORT_REPLACEMENT',
    expectedGain: estimate.expectedGain, gainUncertainty: estimate.gainUncertainty,
    marginalCost: estimate.marginalCost, costUncertainty: estimate.costUncertainty };
}

function rankPortfolio(candidates, input, signals) {
  return rankAdaptiveTopologies({
    candidates,
    currentTopology: input.currentTopology,
    currentWorkerKinds: (input.workerAssignments || []).map(workerKindOf).filter(Boolean),
    availableWorkerKinds: input.availableWorkerKinds,
    availableCapabilities: input.availableCapabilities,
    diagnosis: signals,
    budget: input.budget,
    operationalConstraints: input.operationalConstraints
  });
}

function replaceableCandidates(candidates) {
  return candidates.filter(candidate => candidate.kind !== 'NO_CHANGE'
    && candidate.admissibility !== 'rejected')
    .map(candidate => ({ candidateId: candidate.candidateId, scale: 'COHORT_REPLACEMENT' }));
}

function admittedSelection(ranking, scaleDecision) {
  const selected = ranking.decision.decision === 'PROPOSE'
    ? ranking.candidates.find(item => item.id === ranking.decision.selectedId) : null;
  return selected && scaleDecision.scale === selected.interventionScale
    && scaleDecision.candidateId === selected.id ? selected : null;
}

function selectionSummary(selected, input, scaleDecision) {
  if (!selected) return { candidateId: 'NO_CHANGE', topology: input.currentTopology || null,
    variant: input.currentVariant || null, kind: 'NO_CHANGE', interventionScale: 'NO_CHANGE',
    executionEligible: false };
  return {
    candidateId: selected.id, topology: selected.topology, variant: selected.variant,
    kind: selected.kind, interventionScale: scaleDecision.scale,
    expectedGain: selected.expectedGain, gainUncertainty: selected.gainUncertainty,
    marginalCost: selected.marginalCost, costUncertainty: selected.costUncertainty,
    ...(scaleDecision.scale === 'COMMUNICATION_REDUCTION'
      ? { communicationIntervention: { candidateId: selected.candidateId, scale: scaleDecision.scale } } : {}),
    executionEligible: false
  };
}

function estimateCost(candidate, input) {
  const explicit = Number(input.estimatedCosts?.[candidate.candidateId]);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const leaves = Array.isArray(candidate.members) ? candidate.members.length : 1;
  return Math.ceil((Number(input.budget?.tokens) || 0) * Math.min(0.8, 0.12 * leaves));
}

function problemFit(candidate, signals) {
  const affinity = candidate.affinity;
  if (!affinity) return 0.5;
  const values = Object.keys(signals).filter(key => Number.isFinite(Number(affinity[key])));
  if (!values.length) return 0.5;
  return values.reduce((sum, key) => sum + 1 - Math.abs(signals[key] - unit(affinity[key])), 0) / values.length;
}

function workerKindOf(worker) {
  return typeof worker === 'string' ? worker : worker?.workerKind || worker?.kind;
}

function budgetPlan(input, signals) {
  const tokens = Math.max(0, Math.floor(Number(input.budget?.tokens) || 0));
  const explorationShare = signals.uncertainty >= 0.6 ? 0.2 : 0.1;
  const verificationShare = signals.adversarialRisk >= 0.35 || signals.contradiction >= 0.35 ? 0.25 : 0.15;
  return {
    totalTokens: tokens,
    explorationTokens: Math.floor(tokens * explorationShare),
    verificationTokens: Math.floor(tokens * verificationShare),
    executionTokens: tokens - Math.floor(tokens * explorationShare) - Math.floor(tokens * verificationShare),
    maxEpochs: Math.max(1, Math.min(MAX_EPOCHS, Math.floor(Number(input.maxEpochs) || MAX_EPOCHS))),
    stopWhen: ['verified_resolution', 'budget_exhausted', 'policy_epoch_limit',
      'no_admissible_reconfiguration', 'authority_missing']
  };
}

function interventionScaleAvailability(scale, portfolio) {
  if (scale === 'NO_CHANGE') return { status: 'available' };
  if (scale === 'COMMUNICATION_REDUCTION') {
    if (portfolio.communication.status !== 'available') return {
      status: 'unavailable', reason: portfolio.communication.reason
    };
    const estimate = portfolio.calibration.scales[scale].candidates[communicationReduction.CANDIDATE_ID];
    return estimate?.status === 'calibrated'
      ? { status: 'available', estimate, runtimeAvailability: portfolio.communication }
      : { status: 'calibration_required', runtimeAvailability: portfolio.communication };
  }
  const estimate = portfolio.calibration.scales[scale];
  return estimate.status === 'calibrated' && scale === 'COHORT_REPLACEMENT'
    ? { status: 'available', estimate }
    : { status: 'unavailable', reason: estimate.reason || 'runtime_action_not_implemented' };
}

function compileConditionalMorphogenesisPolicy(input = {}) {
  const signals = normalizedSignals(input.diagnosis);
  const mission = typeof input.mission === 'string' ? input.mission.trim() : '';
  const representation = representationFor(signals);
  const portfolio = buildRecipePortfolio(input, signals);
  const workerRoster = buildAdaptiveWorkerRoster({
    phases: phasesFor(signals), workerAssignments: input.workerAssignments,
    runtimeSnapshot: input.runtimeSnapshot, availableCapabilities: input.availableCapabilities,
    daemonAllowed: input.operationalConstraints?.daemonAllowed
  });
  const budget = budgetPlan(input, signals);
  return {
    schemaVersion: 1, kind: 'conditional_morphogenesis_policy', status: mission ? 'proposed' : 'blocked',
    mission,
    diagnosis: { signals, representation },
    decision: { representation: representation.kind, recipe: portfolio.selected,
      interventionScale: portfolio.selected.interventionScale,
      interventionEstimate: portfolio.selected.interventionScale === 'NO_CHANGE' ? null : {
        expectedGain: portfolio.selected.expectedGain, gainUncertainty: portfolio.selected.gainUncertainty,
        marginalCost: portfolio.selected.marginalCost, costUncertainty: portfolio.selected.costUncertainty
      },
      workerRoster, proofObligations: proofObligations(signals, representation), budget },
    portfolio: { generation: portfolio.generation, candidates: portfolio.candidates,
      ranking: portfolio.ranking, calibration: portfolio.calibration,
      communication: portfolio.communication,
      scaleDecision: portfolio.scaleDecision,
      interventionScales: Object.fromEntries(['NO_CHANGE', ...selectorCalibration.SCALE].map((scale) =>
        [scale, interventionScaleAvailability(scale, portfolio)])) },
    conditions: [
      { when: { anySignalAtLeast: 0.6 }, action: 'reassess_representation_and_recipe' },
      { when: { signal: 'provenanceRisk', atLeast: 0.35 }, action: 'quarantine_correlated_claims' },
      { when: { signal: 'stagnation', atLeast: 0.5 }, action: 'fork_diagnostic_microgroup' },
      { when: { receipt: 'verified_resolution' }, action: 'stop_and_validate_promotion' }
    ],
    bounds: { executionAuthorized: false, maxTransitions: 0, maxEpochs: budget.maxEpochs },
    evidencePolicy: { workerReportsAreDiagnosticOnly: true, resolutionRequiresIndependentReceipt: true }
  };
}

function reevaluateConditionalMorphogenesisPolicy(input = {}) {
  const policy = input.policy;
  if (!policy || policy.kind !== 'conditional_morphogenesis_policy') {
    throw new Error('conditional morphogenesis policy required');
  }
  if (typeof input.scope === 'string' && input.scope.length > 0
    && input.receipt?.verified === true && input.receipt?.scope === input.scope) {
    return { status: 'stopped', reason: 'verified_resolution', policy, changed: false };
  }
  const next = compileConditionalMorphogenesisPolicy({ ...input.context,
    diagnosis: input.observation, currentTopology: input.currentTopology,
    currentVariant: input.currentVariant, budget: input.remainingBudget || input.context?.budget });
  const changed = next.decision.representation !== policy.decision.representation
    || next.decision.recipe.candidateId !== policy.decision.recipe.candidateId;
  return { status: 'continue', reason: changed ? 'evidence_changed_policy' : 'policy_stable',
    policy: next, changed };
}

module.exports = { MAX_EPOCHS, SIGNALS, REPRESENTATIONS,
  compileConditionalMorphogenesisPolicy, reevaluateConditionalMorphogenesisPolicy };
