'use strict';

const THRESHOLDS = Object.freeze({
  directDomains: 1,
  experimentability: 0.7,
  semanticConflictRate: 0.4,
  disagreementCentrality: 0.6,
  regionalAutonomy: 0.7,
  looseCoupling: 0.2,
  lowSharedWrites: 0.25,
  lowDependencies: 0.3
});

function createMorphogenesisAdvisor(syncytium) {
  return {
    evaluateMorphogenesis: (signals) => evaluateMorphogenesis(signals || {}),
    analyzeSessionMorphogenesis: (sessionId, signals) => analyzeSession(sessionId, signals || {}, syncytium),
    evaluateMorphogenesisBenchmarks: (runs) => require('../benchmark/syncytiumBenchmarkService').compareRuns(runs)
  };
}

function evaluateMorphogenesis(signals = {}) {
  const components = normalizeSignals(signals);
  const measurementGaps = missingCouplingSignals(signals);
  const couplingScore = measurementGaps.length ? null : components.sharedWriteDensity
    * components.dependencyDensity * components.updateFrequency * components.stalenessCost;
  const transitionSignals = normalizeTransitionSignals(signals);
  const transition = chooseTransition({ ...transitionSignals, couplingScore, measurementGaps, ...components });
  return {
    sourceTopology: 'syncytium', targetTopology: transition.target,
    transitionRequired: transition.target !== 'syncytium', reason: transition.reason,
    couplingScore, components, sharedInvariantCount: transitionSignals.sharedInvariantCount,
    thresholds: THRESHOLDS, measurementGaps
  };
}

function normalizeSignals(signals) {
  return {
    sharedWriteDensity: ratioSignal({ signals, directName: 'sharedWriteDensity', numeratorName: 'sharedWrites', denominatorName: 'totalWrites' }),
    dependencyDensity: ratioSignal({ signals, directName: 'dependencyDensity', numeratorName: 'dependencyLinks', denominatorName: 'possibleDependencies' }),
    updateFrequency: ratioSignal({ signals, directName: 'updateFrequency', numeratorName: 'updatesPerMinute', denominatorName: 'expectedUpdatesPerMinute' }),
    stalenessCost: ratioSignal({ signals, directName: 'stalenessCost', numeratorName: 'staleReadCost', denominatorName: 'maxStaleReadCost' })
  };
}

function ratioSignal(context) {
  const { signals, directName, numeratorName, denominatorName } = context;
  if (signals[directName] !== undefined && signals[directName] !== null) return unitValue(signals[directName], directName);
  if (signals[numeratorName] === undefined || signals[numeratorName] === null
    || signals[denominatorName] === undefined || signals[denominatorName] === null
    || Number(signals[denominatorName]) <= 0) return null;
  const numerator = nonNegative(signals[numeratorName] || 0, numeratorName);
  const denominator = nonNegative(signals[denominatorName] || 0, denominatorName);
  return Math.min(1, numerator / denominator);
}

function chooseTransition(signals) {
  if (signals.activeDomains !== null && signals.activeDomains <= THRESHOLDS.directDomains) {
    return { target: 'direct', reason: 'One active domain remains.' };
  }
  if (meets(signals.semanticConflictRate, THRESHOLDS.semanticConflictRate)
    && meets(signals.experimentability, THRESHOLDS.experimentability)) {
    return { target: 'trinity', reason: 'A semantic conflict can be decided experimentally.' };
  }
  if (meets(signals.disagreementCentrality, THRESHOLDS.disagreementCentrality)) {
    return { target: 'biocenose', reason: 'Disagreement and collective decision are central.' };
  }
  if (meets(signals.regionalAutonomy, THRESHOLDS.regionalAutonomy)) {
    return { target: 'metapopulation', reason: 'Regional autonomy is desirable.' };
  }
  return looselyCoupled(signals);
}

function looselyCoupled(signals) {
  if (signals.measurementGaps.length) {
    return { target: 'syncytium', reason: 'Insufficient coupling telemetry; retain Syncytium until measurements are available.' };
  }
  const weakWrites = signals.sharedWriteDensity < THRESHOLDS.lowSharedWrites;
  const weakDependencies = signals.dependencyDensity < THRESHOLDS.lowDependencies;
  if (signals.couplingScore < THRESHOLDS.looseCoupling && (weakWrites || weakDependencies)
    && signals.sharedInvariantCount === 0) {
    return { target: 'a_team', reason: 'Domains have become loosely coupled.' };
  }
  return { target: 'syncytium', reason: 'Shared state remains sufficiently coupled.' };
}

function missingCouplingSignals(signals) {
  return [
    ['sharedWriteDensity', 'sharedWrites', 'totalWrites'],
    ['dependencyDensity', 'dependencyLinks', 'possibleDependencies'],
    ['updateFrequency', 'updatesPerMinute', 'expectedUpdatesPerMinute'],
    ['stalenessCost', 'staleReadCost', 'maxStaleReadCost']
  ].filter(([direct, numerator, denominator]) => (signals[direct] === undefined || signals[direct] === null)
    && (signals[numerator] === undefined || !Number.isFinite(Number(signals[denominator]))
      || Number(signals[denominator]) <= 0)).map(([direct]) => direct);
}

function normalizeTransitionSignals(signals) {
  const activeDomains = signals.activeDomains === undefined ? null : nonNegative(signals.activeDomains, 'activeDomains');
  const sharedInvariantCount = nonNegative(signals.sharedInvariantCount || 0, 'sharedInvariantCount');
  return {
    ...signals, activeDomains, sharedInvariantCount,
    semanticConflictRate: signals.semanticConflictRate === undefined ? undefined : unitValue(signals.semanticConflictRate, 'semanticConflictRate'),
    experimentability: signals.experimentability === undefined ? undefined : unitValue(signals.experimentability, 'experimentability'),
    disagreementCentrality: signals.disagreementCentrality === undefined ? undefined : unitValue(signals.disagreementCentrality, 'disagreementCentrality'),
    regionalAutonomy: signals.regionalAutonomy === undefined ? undefined : unitValue(signals.regionalAutonomy, 'regionalAutonomy')
  };
}

function meets(value, threshold) {
  return value !== undefined && unitValue(value, 'transition signal') >= threshold;
}

function unitValue(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw Object.assign(new Error(`${label} must be between 0 and 1.`), { code: 'SYNCYTIUM_MORPHOGENESIS_SIGNAL_INVALID' });
  }
  return number;
}

function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw Object.assign(new Error(`${label} must be a non-negative number.`), { code: 'SYNCYTIUM_MORPHOGENESIS_SIGNAL_INVALID' });
  }
  return number;
}

async function analyzeSession(sessionId, signals, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, signals.options || {});
  const activeDomains = Object.keys(snapshot.domains || {}).filter((domainId) => !['organism', 'shared-state'].includes(domainId)).length;
  const sharedInvariantCount = Object.keys(snapshot.schema?.invariants || {}).length;
  const recommendation = evaluateMorphogenesis({ ...signals, activeDomains, sharedInvariantCount });
  const result = { ...recommendation, sessionId, stateVersion: snapshot.shared.totalOps, consistency: snapshot.consistency };
  if (!recommendation.transitionRequired || recommendation.targetTopology === 'direct') {
    return { ...result, morphogenesisPlan: null, planningContextComplete: false };
  }
  if (snapshot.consistency.verdict !== 'consistent') {
    return { ...result, morphogenesisPlan: null, planningBlocked: 'SYNCYTIUM_INCONSISTENT' };
  }
  const morphogenesisPlan = createTransitionPlan({ sessionId, signals, recommendation });
  if (!morphogenesisPlan.validation.valid) {
    return {
      ...result, morphogenesisPlan: null, planningBlocked: 'MORPHOGENESIS_PLAN_INVALID',
      planningErrors: morphogenesisPlan.validation.errors
    };
  }
  return {
    ...result, morphogenesisPlan,
    planningContextComplete: hasAgentInventory(signals)
  };
}

function hasAgentInventory(signals) {
  const agents = signals.currentState?.agents || signals.currentAgents;
  if (agents instanceof Map) return agents.size > 0;
  return Array.isArray(agents) && agents.length > 0;
}

function createTransitionPlan(context) {
  const { sessionId, signals, recommendation } = context;
  const planner = require('../../morphogenesis/morphogenesisPlannerService');
  const currentState = signals.currentState || {};
  const plan = planner.planMorphogenesis({
    missionId: sessionId,
    mission: signals.mission || `Syncytium transition ${sessionId}`,
    currentState: {
      ...currentState, topology: 'syncytium',
      agents: currentState.agents || signals.currentAgents || new Map(),
      capabilities: currentState.capabilities || signals.availableCapabilities || []
    },
    proposedTopology: recommendation.targetTopology,
    budget: signals.budget || 0,
    reason: recommendation.reason
  });
  plan.validation = planner.validatePlan({ plan });
  return plan;
}

module.exports = { THRESHOLDS, createMorphogenesisAdvisor, evaluateMorphogenesis };
