'use strict';

const { createMorphologyNode } = require('./graph/morphologyNode');

function createRhizomeBranch(input) {
  if (!Number.isFinite(input.growthBudget) || input.growthBudget <= 0) {
    throw Object.assign(new Error('A Rhizome morphology branch requires a positive growth budget.'), {
      code: 'MORPHOGENESIS_RHIZOME_GROWTH_BUDGET_REQUIRED'
    });
  }
  return createMorphologyNode({
    nodeId: `rhizome:${input.parentNodeId}`,
    kind: 'TOPOLOGY',
    topology: 'rhizome',
    scope: 'mission',
    mission: input.mission,
    parentNodeId: input.parentNodeId,
    capabilities: ['capability:distributed-exploration'],
    budget: { growth: input.growthBudget },
    evidencePolicy: { mode: 'distributed_dossier', promotion: 'verified-only' },
    communicationPolicy: { default: 'capability_mesh' },
    lifecycle: 'proposed'
  });
}

module.exports = { createRhizomeBranch };
