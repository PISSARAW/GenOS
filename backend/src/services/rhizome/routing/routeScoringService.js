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
  const { weights = {}, now = Date.now(), lineageEdgeIds } = options;
  const metrics = routeMetrics(route, provider, { now, lineageEdgeIds });
  return (weights.latency || 0) / (1 + metrics.latency / 10000)
    + (weights.cost || 0) / (1 + metrics.cost / 100)
    + (weights.risk || 0) * metrics.reliability + (weights.trust || 0) * metrics.trust
    + (weights.freshness || 0) * metrics.freshness + (weights.curiosity || 0) * metrics.novelty
    + (weights.congestion || 0) * metrics.congestion;
}

function routeMetrics(route, provider, options) {
  const { now = Date.now(), lineageEdgeIds } = options || {};
  const lineageSet = lineageEdgeIds instanceof Set ? lineageEdgeIds : null;
  return {
    reliability: route.edges.reduce((value, edge) => value * edge.reliability, provider.reliability),
    cost: route.edges.reduce((sum, edge) => sum + edge.cost, provider.cost),
    latency: route.edges.reduce((sum, edge) => sum + edge.latency, provider.latency),
    trust: average(route.edges, (edge) => edge.evidenceQuality),
    freshness: average(route.edges, (edge) => freshnessScore(edge, now)),
    novelty: average(route.edges, (edge) => noveltyScore(edge, lineageSet)),
    congestion: average(route.edges, (edge) => 1 / (1 + edge.trailState.verifiedFlow))
  };
}

function average(edges, score) {
  return edges.length ? edges.reduce((sum, edge) => sum + score(edge), 0) / edges.length : 1;
}

function noveltyScore(edge, lineageEdgeIds = null) {
  const usage = edge.trailState.positive + edge.trailState.negative + edge.trailState.verifiedFlow;
  const rarity = 1 - Math.min(1, usage / 300);
  if (lineageEdgeIds != null && !lineageEdgeIds.has(edge.edgeId)) {
    return Math.min(1, rarity + 0.25);
  }
  return rarity;
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
