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
assert.equal(constrained.dispatchWorkers.length, 1);

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