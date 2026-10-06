'use strict';

function distribution(routes, policy = {}) {
  const temperature = policy.temperature ?? 0.5;
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw Object.assign(new Error('Routing temperature must be finite and positive.'), { code: 'RHIZOME_ROUTING_TEMPERATURE_INVALID' });
  }
  const scores = routes.map(route => route.utility + Math.log(Math.max(1e-12, route.conductivity ?? 1)));
  const maximum = Math.max(...scores);
  const weights = scores.map(score => Math.exp((score - maximum) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return routes.map((route, index) => ({ routeId: route.routeId, probability: weights[index] / total }));
}

function select(routes, policy = {}) {
  if (policy.selection !== 'softmax') return { route: routes[0], selection: 'deterministic' };
  const probabilities = distribution(routes, policy);
  const draw = (policy.random || Math.random)();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw Object.assign(new Error('Routing draw must be within [0, 1).'), { code: 'RHIZOME_ROUTING_DRAW_INVALID' });
  }
  let cumulative = 0;
  const chosen = probabilities.find(item => { cumulative += item.probability; return draw < cumulative; });
  const routeId = (chosen || probabilities.at(-1)).routeId;
  return { route: routes.find(route => route.routeId === routeId), selection: 'softmax', probabilities, draw };
}

module.exports = { distribution, select };
