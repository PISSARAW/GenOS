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
  if (assignments.length !== 3) {
    throw Object.assign(new Error('Trinity requires exactly three dispatched worlds.'), { code: 'TRINITY_WORLD_COUNT_INVALID' });
  }
  const policy = plan.tokenPolicy || {};
  policy.allocation = plan.trinity.adaptiveBudget === true
    ? 'trinity_adaptive_all_worlds'
    : 'equal_minimum_then_score_weighted';
  policy.rounds = buildAllocation({
    totalTokens: policy.total,
    workerShare: policy.workerShare,
    workerCount: 3,
    minimumWorkerTokens: policy.minimumWorkerTokens,
    mode: policy.allocation
  });
  if (policy.rounds.initial.workerCount !== 3) {
    throw Object.assign(new Error('The available budget cannot fund three Trinity worlds.'), { code: 'TRINITY_BUDGET_INSUFFICIENT' });
  }
}

function normalizeParentBudget(parentBudget) {
  const numeric = Number(parentBudget);
  if (Number.isFinite(numeric) === false) return 100;
  if (numeric < 0) return 0;
  return numeric;
}

function normalizeWorkerShare(workerShare) {
  const numeric = Number(workerShare);
  if (Number.isFinite(numeric) === false) return 0.6;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function normalizeWorkerCount(workerCount) {
  const numeric = Number(workerCount);
  if (Number.isFinite(numeric) === false) return 1;
  const floored = Math.floor(numeric);
  if (floored < 1) return 1;
  return floored;
}

function calculateInheritedCognitiveBudget(parentBudget, workerShare, workerCount) {
  const parent = normalizeParentBudget(parentBudget);
  const share = normalizeWorkerShare(workerShare);
  const count = normalizeWorkerCount(workerCount);
  return (parent * share) / count;
}

async function executeWorkerPipeline(pipelineContext) {
  return pipeline.executeWorkerPipeline(pipelineContext);
}

async function runEvidenceBarrier(barrierContext) {
  return barrier.runEvidenceBarrier(barrierContext);
}

module.exports = { waitForAutonomousWorkerQuiescence, runLocalWorker, createAutonomousWorkers, calculateInheritedCognitiveBudget, executeWorkerPipeline, runEvidenceBarrier };
