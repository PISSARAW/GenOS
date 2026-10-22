'use strict';

const { DEFAULT_OVERCOMMIT_RATIO } = require('../barriers/budgetBarrier');
const { DEFAULT_FIREWALL_POLICY } = require('../firewalls/firewallTypes');
const { DEFAULT_MAX_CHILDREN, DEFAULT_MAX_DEPTH, hasContainmentCycle, hasAuthorityCycle } = require('../graph/morphologyGraphValidator');

const DEFAULT_TIMESCALE_CONFIG = Object.freeze({
  fastIntervalMs: 5000,
  structuralIntervalMs: 60000,
  evolutionaryIntervalMs: 3600000
});

// Valeurs par défaut figées par ADR 0720 (docs/02-orchestration/topologies/morphogenese.md §12) :
// - defaultTopology = 'Trinity' : comparaison contradictoire à trois mondes avant promotion
// - overcommitRatio = 1.5 : marge de 50 % au-dessus du budget global
// - memoryRetention = 30 (jours) : cycle d'observation de 30 jours avant purge/décroissance
// - firewallPolicy = 'STRICT' : posture fail-closed par défaut
const DEFAULT_CONFIG = Object.freeze({
  maxChildren: DEFAULT_MAX_CHILDREN,
  maxDepth: DEFAULT_MAX_DEPTH,
  defaultTopology: 'Trinity',
  overcommitRatio: DEFAULT_OVERCOMMIT_RATIO,
  hysteresisMargin: 0.1,
  bridgeThreshold: 0.85,
  typeCheckOnTransition: true,
  memoryRetention: 30,
  antiFlapWindow: 300,
  antiFlapWindowMs: 300000,
  firewallPolicy: DEFAULT_FIREWALL_POLICY,
  regretThreshold: 0.5,
  timescaleConfig: DEFAULT_TIMESCALE_CONFIG
});

function mergeConfig(input) {
  const config = { ...DEFAULT_CONFIG };
  if (input && input.config && typeof input.config === 'object') {
    for (const key of Object.keys(input.config)) config[key] = input.config[key];
    if (input.config.antiFlapWindow !== undefined && input.config.antiFlapWindowMs === undefined) {
      config.antiFlapWindowMs = Number(input.config.antiFlapWindow) * 1000;
    }
  }
  return config;
}

function defaultGraph() {
  return { nodes: [], edges: [], graphId: undefined, rootNodeId: undefined };
}

function assessProfile(profile) {
  const dimensions = profile || {};
  const epistemic = Number(dimensions.epistemicUncertainty || 0);
  const decomposability = Number(dimensions.functionalDecomposability || 0);
  const coupling = Number(dimensions.stateCoupling || 0);
  return {
    epistemic,
    decomposability,
    coupling,
    split: decomposability > 0.5,
    nest: coupling > 0.5
  };
}

function passesHysteresis(context, config) {
  if (!context) return true;
  const hasGain = Number.isFinite(context.expectedGain);
  const hasUtilities = Number.isFinite(context.candidateUtility) && Number.isFinite(context.currentUtility);
  if (!hasGain && !hasUtilities) return true;
  const currentUtility = Number.isFinite(context.currentUtility) ? Number(context.currentUtility) : 1;
  const expectedGain = hasGain
    ? Number(context.expectedGain)
    : Number(context.candidateUtility) - currentUtility;
  const transitionCost = Number.isFinite(context.transitionCost) ? Number(context.transitionCost) : 0;
  const hysteresis = Number(config.hysteresisMargin) * Math.max(1, Math.abs(currentUtility));
  return expectedGain > transitionCost + hysteresis;
}

function decideTransition(context, config) {
  const ctx = context || {};
  const now = Number.isFinite(Number(ctx.now)) ? Number(ctx.now) : Date.now();
  const last = Number.isFinite(Number(ctx.lastTransitionTime)) ? Number(ctx.lastTransitionTime) : -Infinity;
  if (now - last < config.antiFlapWindowMs) {
    return { transition: 'none', reason: 'anti_flap_window' };
  }
  if (!passesHysteresis(ctx, config)) {
    return { transition: 'none', reason: 'hysteresis_margin' };
  }
  const assessment = assessProfile(ctx.profile);
  if (assessment.split) return { transition: 'split', reason: 'high_decomposability' };
  if (assessment.nest) return { transition: 'nest', reason: 'high_coupling' };
  return { transition: 'none', reason: 'stable' };
}

function computeRegret(baseline, current) {
  const base = Number(baseline || 0);
  const curr = Number(current || 0);
  return Math.max(0, base - curr);
}

function computeEfficiency(utility, cost) {
  const u = Number(utility || 0);
  const c = Number(cost || 0);
  if (c <= 0) return u;
  return u / c;
}

function checkInvariants(graphInput, config) {
  const nodes = Array.isArray(graphInput && graphInput.nodes) ? graphInput.nodes : [];
  const edges = Array.isArray(graphInput && graphInput.edges) ? graphInput.edges : [];
  const errors = [];
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children.length : 0;
    if (children > config.maxChildren) errors.push(`node ${node.nodeId || '?'} exceeds maxChildren`);
  }
  if (hasContainmentCycle(nodes, edges)) errors.push('containment relationships must be acyclic');
  if (hasAuthorityCycle(edges)) errors.push('authority relationships must be acyclic (DAG)');
  return { valid: errors.length === 0, errors };
}

function recordTelemetry(sample, telemetry) {
  const entry = { timestamp: Date.now(), ...(sample || {}) };
  if (Array.isArray(telemetry.samples)) telemetry.samples.push(entry);
  return entry;
}

function updateRegret(value, regretTracker) {
  regretTracker.regret = Number(value || 0);
  if (Array.isArray(regretTracker.history)) regretTracker.history.push({ value: regretTracker.regret, timestamp: Date.now() });
  return regretTracker.regret;
}

function createMorphogeneticController(input = {}) {
  const config = mergeConfig(input);
  const graph = input.graph || defaultGraph();
  const policy = input.policy || {};
  const memory = input.memory || {};
  const telemetry = input.telemetry || { samples: [] };
  const regretTracker = input.regretTracker || { regret: 0, history: [] };
  return {
    config,
    graph,
    policy,
    memory,
    telemetry,
    regretTracker,
    assessProfile,
    decideTransition: (context) => decideTransition(context, config),
    computeRegret,
    computeEfficiency,
    checkInvariants: (graphInput) => checkInvariants(graphInput, config),
    recordTelemetry: (sample) => recordTelemetry(sample, telemetry),
    updateRegret: (value) => updateRegret(value, regretTracker)
  };
}

module.exports = { createMorphogeneticController, DEFAULT_CONFIG, DEFAULT_TIMESCALE_CONFIG };
