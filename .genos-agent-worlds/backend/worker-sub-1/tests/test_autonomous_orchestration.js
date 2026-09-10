const assert = require('assert');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');

const securityContract = buildStrategyContract({
  problem: 'Investigate a high-risk security incident with uncertain exploitability and complex cross-service impact.',
  problemProfile: { type: 'security', risk: 'high', complexity: 0.9, uncertainty: 0.9 }
});
const plan = buildAutonomyPlan(securityContract, { tokens: 48000, minimumWorkerTokens: 8000 });

assert(plan.registry.total >= 78, 'the whole strategy registry must be evaluated');
assert.strictEqual(plan.registry.selected.length > 0, true);
assert.strictEqual(plan.organization, 'red_blue_coevolution');
assert.equal(plan.executionStatus, 'blocked');
assert.equal(plan.executionBlockers[0].code, 'NO_REALIZABLE_PHASES');
assert.strictEqual(plan.organizationPolicy.transitions.length, 4);
assert.strictEqual(plan.decisionGates.length, 6);
assert(plan.decisionGates.find((gate) => gate.id === 'reselect_strategy').actions.includes('genos_change_strategy'));
assert(plan.decisionGates.find((gate) => gate.id === 'fork_or_delegate').actions.includes('genos_create'));
assert(plan.decisionGates.find((gate) => gate.id === 'select_or_merge_hypotheses').actions.includes('genos_merge'));
assert.deepStrictEqual(plan.dispatchWorkers.map((worker) => worker.label), ['red', 'blue', 'observer']);
const phaseKeys = new Set([...plan.phases, ...plan.omittedPhases].map((entry) => entry.key));
assert(phaseKeys.has('snapshot_before_mutation'));
assert(phaseKeys.has('counterfactual_forks'));
assert(phaseKeys.has('red_queen'));
assert(phaseKeys.has('replay_and_promote'));
const plannedOrOmittedTools = new Set([
  ...plan.requiredTools,
  ...plan.omittedPhases.flatMap((entry) => entry.missingTools || [])
]);
assert(plannedOrOmittedTools.has('genos_snapshot'));
assert(plannedOrOmittedTools.has('genos_fork'));
assert(plan.decisionGates.some((gate) => gate.actions.includes('genos_replay')));
assert.strictEqual(plan.parasitism.enabled, true);
assert.strictEqual(plan.tokenPolicy.allocation, 'successive_halving_with_reallocation');
assert.strictEqual(plan.tokenPolicy.rounds.initial.workerCount, 3);
assert.strictEqual(plan.tokenPolicy.rounds.initial.perWorkerTokens, 9600);
assert.strictEqual(plan.tokenPolicy.rounds.continuation.survivorCount, 0);
assert.strictEqual(plan.tokenPolicy.rounds.continuation.perWorkerTokens, 0);

const blockedPlan = buildAutonomyPlan({ problem_profile: { type: 'general' }, strategy_portfolio: [], branches: [] }, { tokens: 500000 });
assert.equal(blockedPlan.executionStatus, 'blocked');
assert.equal(blockedPlan.executionBlockers[0].code, 'NO_REALIZABLE_PHASES');

const lowBudgetPlan = buildAutonomyPlan(securityContract, { tokens: 6000, minimumWorkerTokens: 8000 });
assert.strictEqual(lowBudgetPlan.dispatchWorkers.length, 0, 'the orchestrator must retain control rather than launch unaffordable workers');

const decoded = decodeMission(encodeMission({ agentId: 'agent_test', autonomyPlanJson: JSON.stringify(plan) }));
assert.strictEqual(JSON.parse(decoded.autonomyPlanJson).schema, 'genos.autonomous-orchestration/v1alpha1');
assert(plan.organizationPolicy.availableOrganizations.includes('stigmergy'));
assert(plan.organizationPolicy.availableOrganizations.includes('network_silence'));
assert(plan.organizationPolicy.communicationModes.includes('active'));
assert(plan.organizationPolicy.communicationModes.includes('implicit'));

console.log('Autonomous orchestration plan checks passed.');
