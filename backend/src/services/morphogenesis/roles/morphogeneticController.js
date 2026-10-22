'use strict';

const DEFAULT_CONFIG = Object.freeze({
  hysteresisMargin: 0.1,
  antiFlapWindowMs: 300000,
  maxChildren: 8,
  maxDepth: 6,
  regretThreshold: 0.5
});

function mergeConfig(input) {
  const config = { ...DEFAULT_CONFIG };
  if (input && input.config && typeof input.config === 'object') {
    for (const key of Object.keys(input.config)) config[key] = input.config[key];
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

function decideTransition(context, config) {
  const now = context && context.now ? Number(context.now) : Date.now();
  const last = context && context.lastTransitionTime ? Number(context.lastTransitionTime) : 0;
  if (now - last < config.antiFlapWindowMs) {
    return { transition: 'none', reason: 'anti_flap_window' };
  }
  const assessment = assessProfile(context.profile);
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
  const errors = [];
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children.length : 0;
    if (children > config.maxChildren) errors.push(`node ${node.nodeId || '?'} exceeds maxChildren`);
  }
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

module.exports = { createMorphogeneticController, DEFAULT_CONFIG };
