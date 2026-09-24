'use strict';

const connectivity = require('./connectivityService');
const bridgeDetection = require('./bridgeDetectionService');
const articulationPoints = require('./articulationPointService');

function assess(session) {
  const active = (session.nodes || []).filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state));
  return {
    componentCount: connectivity.components(session),
    activeNodeCount: active.length,
    isolatedNodeIds: active.filter((node) => !(session.edges || []).some((edge) => edge.status === 'ACTIVE'
      && (edge.from === node.nodeId || edge.to === node.nodeId))).map((node) => node.nodeId),
    bridgeEdgeIds: bridgeDetection.bridges(session),
    articulationNodeIds: articulationPoints.articulationPoints(session)
  };
}

module.exports = { assess };
