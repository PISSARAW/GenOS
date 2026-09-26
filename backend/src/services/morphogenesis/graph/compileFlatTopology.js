'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');
const { createRhizomeBranch } = require('../rhizomeBranchAdapter');
const { createTrinityBranch } = require('../trinityBranchAdapter');
const { topologyExpression, nestExpression, parallelExpression, sequenceExpression, gateExpression, competeExpression, wrapExpression, bridgeExpression, federateExpression, flattenExpression, annotateWithDefaults } = require('../expression');
const { createMorphologyNode, createPort } = require('./morphologyNode');

function compileFlatTopology(input = {}) {
  const { selectedTopology = 'single_agent', organization = null, graphId, missionId, version = 1, status = 'proposed', budget = {}, globalInvariants = [], variant = null, mission = null, scope = 'mission', workers = [], expression = null } = input;
  const topology = selectedTopology ?? 'single_agent';

  let expr;
  if (expression) {
    expr = expression;
  } else {
    expr = topologyExpression(topology, variant, { mission, scope, budget });
  }

  const annotated = annotateWithDefaults(expr, { mission, scope, budget });
  const { nodes, edges } = flattenExpression(annotated);

  const graph = createMorphologyGraph({
    graphId,
    missionId,
    version,
    status,
    globalBudget: budget,
    globalInvariants,
    nodes,
    edges
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

function compileMorphologyExpression(expression, options = {}) {
  const { compileExpression } = require('./morphologyCompiler');
  return compileExpression(expression, options);
}

module.exports = { compileFlatTopology, compileMorphologyExpression };
