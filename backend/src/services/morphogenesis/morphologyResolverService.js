'use strict';

const { compileExpression } = require('./graph/morphologyCompiler');
const { topologyExpression, parallelExpression } = require('./expression/morphologyExpression');

function uniqueTopologies(selectedTopology, profile = {}) {
  const exploring = Number(profile.hypotheses_count || 0) >= 3
    && Number(profile.uncertainty || 0) >= 0.6;
  if (!exploring) return [selectedTopology];
  return [...new Set([selectedTopology, 'trinity', 'rhizome'])];
}

function resolveExpression(input) {
  if (input.expression) return input.expression;
  const topologies = uniqueTopologies(input.selectedTopology, input.problemProfile);
  const leaves = topologies.map((topology) => topologyExpression(
    topology,
    topology === input.selectedTopology ? input.topologyProfile?.selectedVariant : null,
    { metadata: topology === input.selectedTopology ? input.topologyProfile || {} : {} },
  ));
  if (leaves.length === 1) return leaves[0];
  return parallelExpression(leaves, {
    mission: input.missionId || input.problemId || null,
    budget: input.budget || {},
    metadata: { resolution: 'high_uncertainty_hypothesis_search' },
  });
}

function resolveMorphology(input = {}) {
  const expression = resolveExpression(input);
  const graph = compileExpression(expression, {
    graphId: input.graphId,
    missionId: input.missionId || input.problemId,
    mission: input.problem || input.mission,
    globalBudget: input.budget,
  });
  return {
    expression,
    graph,
    source: input.expression ? 'provided_expression' : 'profile_resolution',
    selectedTopology: input.selectedTopology,
  };
}

module.exports = { resolveMorphology, resolveExpression };
