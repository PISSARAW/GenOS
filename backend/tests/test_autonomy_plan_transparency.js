const assert = require('node:assert/strict');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');

const contract = {
  problem_profile: { type: 'security', complexity: 0.9, uncertainty: 0.9, risk: 'high' },
  branches: [{ label: 'a', hypothesis: 'h1' }, { label: 'b', hypothesis: 'h2' }],
  strategy_portfolio: []
};
const plan = buildAutonomyPlan(contract, { tokens: 10000, minimumWorkerTokens: 8000 });
assert.equal(plan.exploration.available, false);
assert.equal(plan.exploration.selectedBranches, 0);
assert.match(plan.dispatchDecision.reason, /budget/);
assert(plan.omittedPhases.some((phase) => phase.key === 'counterfactual_forks'));
console.log('Autonomy plans expose exploration and omitted-phase decisions.');