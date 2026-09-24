'use strict';

const connectivity = require('./connectivityService');

function articulationPoints(session) {
  const baseline = connectivity.components(session);
  return (session.nodes || []).filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)
    && connectivity.componentCount(session, node.nodeId, null) > baseline).map((node) => node.nodeId);
}

module.exports = { articulationPoints };
