const assert = require('assert');
const { buildStrategyContract } = require('./src/services/strategyContractService');
const { buildAutonomyPlan } = require('./src/services/autonomousOrchestrationService');
const { encodeMission, decodeMission } = require('./src/services/runtimeProtocol');

const securityContract = buildStrategyContract({
  problem: 'Investigate a high-risk security incident with uncertain exploitability and complex cross-service impact.',
  problemProfile: { type: 'security', risk: 'high', complexity: 0.9, uncertainty: 0.9 }
});
const plan = buildAutonomyPlan(securityContract, { tokens: 48000, minimumWorkerTokens: 8000 });

assert.strictEqual(plan.registry.total, 77, 'the whole registry must be evaluated');
assert.strictEqual(plan.registry.selected.length > 0, true);
assert.strictEqual(plan.organization, 'red_blue_coevolution');
assert.strictEqual(plan.organizationPolicy.transitions.length, 4);
assert.strictEqual(plan.decisionGates.length, 5);
assert(plan.decisionGates.find((gate) => gate.id === 'fork_or_delegate').actions.includes('genos_create'));
assert(plan.decisionGates.find((gate) => gate.id === 'select_or_merge_hypotheses').actions.includes('genos_merge'));
assert.deepStrictEqual(plan.dispatchWorkers.map((worker) => worker.label), ['red', 'blue', 'observer']);
assert(plan.phases.some((entry) => entry.key === 'snapshot_before_mutation'));
assert(plan.phases.some((entry) => entry.key === 'counterfactual_forks'));
assert(plan.phases.some((entry) => entry.key === 'red_queen'));
assert(plan.phases.some((entry) => entry.key === 'replay_and_promote'));
assert(plan.requiredTools.includes('genos_snapshot'));
assert(plan.requiredTools.includes('genos_fork'));
assert(plan.requiredTools.includes('genos_replay'));
assert.strictEqual(plan.parasitism.enabled, true);
assert.strictEqual(plan.tokenPolicy.allocation, 'successive_halving_with_reallocation');

const lowBudgetPlan = buildAutonomyPlan(securityContract, { tokens: 6000, minimumWorkerTokens: 8000 });
assert.strictEqual(lowBudgetPlan.dispatchWorkers.length, 0, 'the orchestrator must retain control rather than launch unaffordable workers');

const decoded = decodeMission(encodeMission({ agentId: 'agent_test', autonomyPlanJson: JSON.stringify(plan) }));
assert.strictEqual(JSON.parse(decoded.autonomyPlanJson).schema, 'genos.autonomous-orchestration/v1alpha1');

console.log('Autonomous orchestration plan checks passed.');
