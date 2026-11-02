const assert = require('node:assert/strict');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { buildAutonomyPlan, applySurvivalConstraints } = require('../src/services/autonomousOrchestrationService');
const { evaluateSurvival } = require('../src/services/survivalModelService');

const healthy = evaluateSurvival({ tokens: 12000, uncertainty: 0.1 });
assert.deepEqual(healthy.pressures, []);
assert.deepEqual(healthy.actions, []);

const contract = buildStrategyContract({
  problem: 'Investigate a high-risk security incident with uncertain exploitability.',
  problemProfile: { type: 'security', risk: 'high', complexity: 0.9, uncertainty: 0.9 }
});
const constrained = buildAutonomyPlan(contract, {
  tokens: 2400,
  minimumWorkerTokens: 800,
  survivalState: { activeWorkers: 9, carryingCapacity: 4 }
});
assert.deepEqual(constrained.survival.pressures, ['starvation', 'overgrowth']);
assert(constrained.survival.actions.includes('conserve_energy'));
assert.equal(constrained.survival.constraints.maxWorkerFanout, 2);
assert.equal(constrained.workers.length, 2);
assert.equal(constrained.dispatchWorkers.length, 0);
assert.equal(constrained.tokenPolicy.orchestratorReserveTokens, 2400);
assert.equal(constrained.tokenPolicy.admission.availableWorkerTokens, 0);
assert.equal(constrained.tokenPolicy.admission.valid, false);
assert.equal(constrained.dispatchDecision.code, 'TOPOLOGY_BUDGET_INSUFFICIENT');
assert.equal(constrained.tokenPolicy.admission.minimumAcceptableTotal, 7600);

for (const [tokens, expectedWorkers] of [[6800, 0], [7599, 0], [7600, 2]]) {
  const plan = buildAutonomyPlan(contract, {
    tokens, minimumWorkerTokens: 800,
    survivalState: { energy: 0.2, activeWorkers: 9, carryingCapacity: 4 }
  });
  assert.deepEqual(plan.survival.pressures, ['starvation', 'overgrowth']);
  assert.equal(plan.survival.constraints.maxWorkerFanout, 2);
  assert.equal(plan.tokenPolicy.orchestratorReserveTokens, 6000);
  assert.equal(plan.tokenPolicy.admission.atomic, true);
  assert.equal(plan.tokenPolicy.admission.availableWorkerTokens, tokens - 6000);
  assert.equal(plan.tokenPolicy.admission.requiredWorkerTokens, 1600);
  assert.equal(plan.dispatchWorkers.length, expectedWorkers,
    'security admission must fund the entire team after reserving orchestrator tokens');
  assert.equal(plan.tokenPolicy.admission.valid, expectedWorkers === 2);
}

const recomposed = {
  survival: constrained.survival,
  workers: [1, 2, 3],
  dispatchWorkers: [1, 2, 3],
  tokenPolicy: { total: 24000, workerShare: 0.6, orchestratorReserve: 0.4, minimumWorkerTokens: 800, allocation: 'successive_halving_with_reallocation' }
};
applySurvivalConstraints(recomposed);
assert.equal(recomposed.dispatchWorkers.length, 2);
assert.equal(recomposed.tokenPolicy.rounds.initial.workerCount, 2);

const dormant = evaluateSurvival({ energy: 0.5, habitatLoss: 0.9 });
assert.equal(dormant.constraints.maxWorkerFanout, 0);
assert.equal(dormant.constraints.suspend, true);

const unproven = evaluateSurvival({ energy: 1, coherence: 0.9, reproductionPotential: 0.9 });
const proven = evaluateSurvival({ energy: 1, coherence: 0.9, reproductionPotential: 0.9, independentlyValidated: true });
assert(!unproven.actions.includes('reproduce_strategy'));
assert(proven.actions.includes('reproduce_strategy'));

console.log('Survival state, pressures and bounded policies are enforced.');
