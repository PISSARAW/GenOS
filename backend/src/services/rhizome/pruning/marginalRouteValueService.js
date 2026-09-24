'use strict';

const routePlanner = require('../routing/routePlanner');

function valueWithoutEdge(session, need, edgeId) {
  const route = routePlanner.plan({ ...session, edges: session.edges.filter((edge) => edge.edgeId !== edgeId) }, need);
  return route.selected ? 1 : 0;
}

function calculate(session, edge) {
  const needs = session.activeNeeds || [];
  let lostRoutes = 0;
  for (const need of needs) {
    const before = routePlanner.plan(session, need).selected;
    const after = valueWithoutEdge(session, need, edge.edgeId) === 1;
    if (before && !after) lostRoutes += 1;
  }
  return { lostRoutes, critical: lostRoutes > 0 };
}

module.exports = { calculate };
