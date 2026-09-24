'use strict';

const { createMorphologyNode } = require('./graph/morphologyNode');

const CHAMBERS = ['direct', 'structured', 'falsification'];

function createTrinityBranch(input) {
  if (!Number.isFinite(input.tokenBudget) || input.tokenBudget <= 0) {
    throw Object.assign(new Error('A Trinity morphology branch requires a positive token budget.'), {
      code: 'MORPHOGENESIS_TRINITY_TOKEN_BUDGET_REQUIRED'
    });
  }
  return createMorphologyNode({
    nodeId: `trinity:${input.parentNodeId}`,
    kind: 'TOPOLOGY',
    topology: 'trinity',
    scope: 'mission',
    mission: input.mission,
    parentNodeId: input.parentNodeId,
    capabilities: ['capability:comparative-evidence'],
    budget: { tokens: input.tokenBudget },
    evidencePolicy: {
      mode: 'sealed_three_worlds',
      worldCount: CHAMBERS.length,
      chambers: CHAMBERS,
      promotion: 'verified-only'
    },
    communicationPolicy: { default: 'sealed_until_comparison' },
    lifecycle: 'proposed'
  });
}

module.exports = { createTrinityBranch };
