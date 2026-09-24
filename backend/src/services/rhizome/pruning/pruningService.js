'use strict';

const routePruning = require('./routePruningService');
const nodePruning = require('./nodePruningService');

function inspect(session, options = {}) {
  return {
    graphVersion: session.graphVersion,
    edgeDispositions: routePruning.propose(session, options),
    nodeDispositions: nodePruning.propose(session)
  };
}

module.exports = { inspect };
