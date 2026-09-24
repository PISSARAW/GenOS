'use strict';

const routePlanner = require('../routing/routePlanner');

function find(session, need, failedEdgeIds) {
  const failed = new Set(failedEdgeIds);
  const edges = session.edges.map((edge) => failed.has(edge.edgeId) ? { ...edge, status: 'DORMANT' } : edge);
  return routePlanner.plan({ ...session, edges }, need);
}

module.exports = { find };
