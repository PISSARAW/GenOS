'use strict';

function edgeUtility(edge) {
  const signal = (edge.compatibility + edge.successRate + edge.evidenceQuality + Math.min(edge.conductivity, 1)) / 4;
  const trail = (edge.trailState.positive - edge.trailState.negative) / 100;
  return signal + trail - edge.cost / 100 - edge.latency / 10000;
}

function routeScore(route, provider) {
  const utility = route.edges.reduce((sum, edge) => sum + edgeUtility(edge), 0);
  return Number((utility + provider.reliability - route.edges.length * 0.1).toFixed(4));
}

function objectiveScore(route, provider, options = {}) {
  const weights = options.weights || {};
  const now = options.now || Date.now();
  const reliability = route.edges.reduce((value, edge) => value * edge.reliability, provider.reliability);
  const cost = route.edges.reduce((sum, edge) => sum + edge.cost, provider.cost);
  const latency = route.edges.reduce((sum, edge) => sum + edge.latency, provider.latency);
  const trust = route.edges.length
    ? route.edges.reduce((sum, edge) => sum + edge.evidenceQuality, 0) / route.edges.length : 1;
  const freshness = route.edges.length
    ? route.edges.reduce((sum, edge) => sum + freshnessScore(edge, now), 0) / route.edges.length : 1;
  return (weights.latency || 0) / (1 + latency)
    + (weights.cost || 0) / (1 + cost)
    + (weights.risk || 0) * reliability
    + (weights.trust || 0) * trust
    + (weights.freshness || 0) * freshness;
}

function freshnessScore(edge, now) {
  if (!edge.trailState.updatedAt) return 0.5;
  const age = Math.max(0, now - Date.parse(edge.trailState.updatedAt));
  return Number.isFinite(age) ? Math.exp(-age / (30 * 24 * 60 * 60 * 1000)) : 0.5;
}

function constraintsSatisfied(route, need, provider) {
  const constraints = need.constraints;
  const cost = route.edges.reduce((sum, edge) => sum + edge.cost, provider.cost);
  const latency = route.edges.reduce((sum, edge) => sum + edge.latency, provider.latency);
  const reliability = route.edges.reduce((value, edge) => value * edge.reliability, provider.reliability);
  const requiredRisk = 1 - reliability;
  return (constraints.cost === null || cost <= constraints.cost)
    && (constraints.latency === null || latency <= constraints.latency)
    && requiredRisk <= constraints.risk
    && need.evidenceRequirements.every((item) => provider.evidenceRequirements.includes(item));
}

module.exports = { edgeUtility, routeScore, objectiveScore, constraintsSatisfied };
