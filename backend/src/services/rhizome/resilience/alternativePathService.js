'use strict';

const routePlanner = require('../routing/routePlanner');

function find(input) {
  const failed = new Set(input.failedEdgeIds);
  const edges = input.session.edges.map((edge) => failed.has(edge.edgeId) ? { ...edge, status: 'DORMANT' } : edge);
  return routePlanner.plan({ ...input.session, edges }, input.need, input.policy);
}

module.exports = { find };
