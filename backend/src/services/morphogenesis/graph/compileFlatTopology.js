'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');
const { createRhizomeBranch } = require('../rhizomeBranchAdapter');
const { createTrinityBranch } = require('../trinityBranchAdapter');

function compileFlatTopology(input = {}) {
  const { selectedTopology = 'single_agent', organization = null, graphId, missionId, version = 1, status = 'proposed', budget = {}, globalInvariants = [], variant = null, mission = null, scope = 'mission', workers = [] } = input;
  const topology = selectedTopology ?? 'single_agent';
  const graph = createMorphologyGraph({
    graphId,
    missionId,
    version,
    status,
    globalBudget: budget,
    globalInvariants,
    rootNode: {
      kind: topology === 'single_agent' ? 'DIRECT_WORKER' : 'TOPOLOGY',
      topology,
      organization,
      variant: variant || (input.topologyProfile && input.topologyProfile.selectedVariant),
      topologyProfile: input.topologyProfile || null,
      mission,
      scope,
      workers,
      budget
    }
  });
  if (input.rhizomeBranch) {
    graph.nodes.push(createRhizomeBranch({
      parentNodeId: graph.rootNodeId,
      mission,
      growthBudget: budget.growth
    }));
  }
  if (input.trinityBranch) {
    graph.nodes.push(createTrinityBranch({
      parentNodeId: graph.rootNodeId,
      mission,
      tokenBudget: budget.trinityTokens
    }));
  }
  return graph;
}

module.exports = { compileFlatTopology };
