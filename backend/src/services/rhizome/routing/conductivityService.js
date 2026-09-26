'use strict';

const MAX_CONDUCTIVITY = 1;

function edgeCongestion(edge) {
  const flow = Math.min(1, edge.trailState.verifiedFlow / 100);
  const repellent = Math.min(1, edge.trailState.negative / 100);
  const traffic = flow + repellent;
  return Number(Math.min(1, traffic).toFixed(4));
}

function nextConductivity(edge, settings) {
  const flow = Math.min(1, edge.trailState.verifiedFlow / 100);
  const repellent = Math.min(1, edge.trailState.negative / 100);
  const value = edge.conductivity + settings.alpha * flow - settings.beta * repellent - settings.decay * edge.conductivity;
  return Number(Math.max(0, Math.min(MAX_CONDUCTIVITY, value)).toFixed(4));
}

function buildEdgeUpdate(edge, settings) {
  const conductivity = nextConductivity(edge, settings);
  const congestion = edgeCongestion(edge);
  return { edgeId: edge.edgeId, conductivity, congestion, verifiedFlow: edge.trailState.verifiedFlow };
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
  const updates = input.session.edges.map((edge) => buildEdgeUpdate(edge, settings));
  const congestion = updates.map((update) => ({ edgeId: update.edgeId, congestion: update.congestion }));
  input.session.edges = input.session.edges.map((prev) => {
    const update = updates.find((u) => u.edgeId === prev.edgeId);
    return update ? { ...prev, conductivity: update.conductivity, trailState: { ...prev.trailState, verifiedFlow: 0 } } : prev;
  });
  input.session.graphVersion += 1;
  return {
    graphVersion: input.session.graphVersion,
    edges: updates.map((update) => ({ edgeId: update.edgeId, conductivity: update.conductivity })),
    congestion,
    settings
  };
}

module.exports = { step, nextConductivity, resolveSettings };
