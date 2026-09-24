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

module.exports = { edgeUtility, routeScore, constraintsSatisfied };
