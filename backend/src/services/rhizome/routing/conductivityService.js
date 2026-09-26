'use strict';

const MAX_CONDUCTIVITY = 1;

function nextConductivity(edge, settings) {
  const flow = Math.min(1, edge.trailState.verifiedFlow / 100);
  const repellent = Math.min(1, edge.trailState.negative / 100);
  const value = edge.conductivity + settings.alpha * flow - settings.beta * repellent - settings.decay * edge.conductivity;
  return Number(Math.max(0, Math.min(MAX_CONDUCTIVITY, value)).toFixed(4));
}

function updateEdge(edge, settings) {
  const conductivity = nextConductivity(edge, settings);
  return {
    ...edge,
    conductivity,
    trailState: { ...edge.trailState, verifiedFlow: 0 }
  };
}

function resolveSettings(input) {
  const variantPolicy = input.session?.variantPolicy?.conductivity;
  if (variantPolicy) {
    return {
      alpha: Number.isFinite(variantPolicy.alpha) ? variantPolicy.alpha : 0.5,
      beta: Number.isFinite(variantPolicy.beta) ? variantPolicy.beta : 0.5,
      tau: Number.isFinite(variantPolicy.tau) ? variantPolicy.tau : 0.5,
      decay: Number.isFinite(variantPolicy.decay) ? variantPolicy.decay : 0.02,
      scoutPriority: variantPolicy.scoutPriority
    };
  }
  return {
    alpha: Number.isFinite(input.alpha) ? input.alpha : 0.5,
    beta: Number.isFinite(input.beta) ? input.beta : 0.5,
    tau: Number.isFinite(input.tau) ? input.tau : 0.5,
    decay: Number.isFinite(input.decay) ? input.decay : 0.02,
    scoutPriority: input.scoutPriority
  };
}

function step(input) {
  const settings = resolveSettings(input);
  const edges = input.session.edges.map((edge) => updateEdge(edge, settings));
  input.session.graphVersion += 1;
  input.session.edges = edges;
  return { graphVersion: input.session.graphVersion, edges: edges.map((edge) => ({ edgeId: edge.edgeId, conductivity: edge.conductivity })), settings };
}

module.exports = { step, nextConductivity, resolveSettings };
