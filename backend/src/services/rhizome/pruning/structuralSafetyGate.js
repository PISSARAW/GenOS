'use strict';

const bridgeDetection = require('../analytics/bridgeDetectionService');
const routeValue = require('./marginalRouteValueService');

function assess(session, edge) {
  const bridges = bridgeDetection.bridges(session);
  const marginal = routeValue.calculate(session, edge);
  const structuralBridge = bridges.includes(edge.edgeId) || edge.relation === 'BRIDGES';
  return { safe: !structuralBridge && !marginal.critical, structuralBridge, ...marginal };
}

module.exports = { assess };
