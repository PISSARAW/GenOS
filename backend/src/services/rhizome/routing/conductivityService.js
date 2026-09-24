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

function step(input) {
  const { session, alpha = 0.5, beta = 0.5, decay = 0.02 } = input;
  const settings = { alpha, beta, decay };
  const edges = session.edges.map((edge) => updateEdge(edge, settings));
  session.graphVersion += 1;
  session.edges = edges;
  return { graphVersion: session.graphVersion, edges: edges.map((edge) => ({ edgeId: edge.edgeId, conductivity: edge.conductivity })) };
}

module.exports = { step, nextConductivity };
