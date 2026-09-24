'use strict';

const connectivity = require('./connectivityService');

function bridges(session) {
  const baseline = connectivity.components(session);
  return (session.edges || []).filter((edge) => edge.status === 'ACTIVE'
    && connectivity.componentCount(session, null, edge.edgeId) > baseline).map((edge) => edge.edgeId);
}

module.exports = { bridges };
