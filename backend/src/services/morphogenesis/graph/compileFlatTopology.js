'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');

function compileFlatTopology(input = {}) {
  const { selectedTopology = 'single_agent', graphId, missionId, version = 1, status = 'proposed', budget = {}, globalInvariants = [], variant = null, mission = null, scope = 'mission', workers = [] } = input;
  const topology = selectedTopology ?? 'single_agent';
  return createMorphologyGraph({
    graphId,
    missionId,
    version,
    status,
    globalBudget: budget,
    globalInvariants,
    rootNode: {
      kind: topology === 'single_agent' ? 'DIRECT_WORKER' : 'TOPOLOGY',
      topology,
      variant,
      mission,
      scope,
      workers,
      budget
    }
  });
}

module.exports = { compileFlatTopology };
