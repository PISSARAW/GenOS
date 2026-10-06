/**
 * Autonomous worker fleets: thin delegation facade.
 * Telemetry contract (implemented in workerEvidenceBarrier modules):
 * WORKER_BARRIER_TIMEOUT, WORKER_EVIDENCE_BARRIER_PARTIAL, SYNTHESIZE_PARTIAL,
 * WORKER_EVIDENCE_DOSSIERS_ATTACHED, WORKER_EVIDENCE_BARRIER_SATISFIED,
 * immuneSystem.phagocytoseCodexReport, IMMUNE_OUTPUT_REJECTED.
 */
const { createAutonomousWorkers: createWorkers } = require('./agentFleetWorkers');
const { buildAllocation } = require('./tokenAllocationService');
const quiescence = require('./workerEvidenceBarrierQuiescence');
const localWorker = require('./workerEvidenceBarrierLocal');
const pipeline = require('./workerEvidenceBarrierPipeline');
const barrier = require('./workerEvidenceBarrier');
const { calculateInheritedCognitiveBudget } = require('./workerCognitiveBudget');

async function waitForAutonomousWorkerQuiescence() {
  const args = Array.from(arguments);
  return quiescence.waitForAutonomousWorkerQuiescence(...args);
}

async function runLocalWorker(db, mission, executionRun) {
  return localWorker.runLocalWorker(db, mission, executionRun);
}

async function createAutonomousWorkers(...args) {
  const plan = args[2];
  enforceTrinityBudget(plan);
  return createWorkers(...args);
}

function enforceTrinityBudget(plan) {
  if (plan?.trinity?.activated !== true) return;
  const assignments = Array.isArray(plan.dispatchWorkers) ? plan.dispatchWorkers : [];
  const count = require('./trinityWorldDesign').expectedWorlds(plan.trinity.variantSelection);
  if (assignments.length !== count) {
    throw Object.assign(new Error('Trinity requires every planned dispatched world.'), { code: 'TRINITY_WORLD_COUNT_INVALID' });
  }
  const policy = plan.tokenPolicy || {};
  policy.allocation = plan.trinity.adaptiveBudget === true
    ? 'trinity_adaptive_all_worlds'
    : 'equal_minimum_then_score_weighted';
  policy.rounds = buildAllocation({
    totalTokens: require('./trinityBudgetPolicy').initialWorkerPool(policy, plan.trinity.variantSelection),
    workerShare: 1,
    workerCount: count,
    minimumWorkerTokens: policy.minimumWorkerTokens,
    mode: policy.allocation
  });
  if (policy.rounds.initial.workerCount !== count) {
    throw Object.assign(new Error('The available budget cannot fund every Trinity world.'), { code: 'TRINITY_BUDGET_INSUFFICIENT' });
  }
}

async function executeWorkerPipeline(pipelineContext) {
  return pipeline.executeWorkerPipeline(pipelineContext);
}

async function runEvidenceBarrier(barrierContext) {
  return barrier.runEvidenceBarrier(barrierContext);
}

module.exports = { waitForAutonomousWorkerQuiescence, runLocalWorker, createAutonomousWorkers, calculateInheritedCognitiveBudget, executeWorkerPipeline, runEvidenceBarrier };
