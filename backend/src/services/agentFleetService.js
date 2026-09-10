/**
 * Autonomous worker fleets: thin delegation facade.
 * Telemetry contract (implemented in workerEvidenceBarrier modules):
 * WORKER_BARRIER_TIMEOUT, WORKER_EVIDENCE_BARRIER_PARTIAL, SYNTHESIZE_PARTIAL,
 * WORKER_EVIDENCE_DOSSIERS_ATTACHED, WORKER_EVIDENCE_BARRIER_SATISFIED,
 * immuneSystem.phagocytoseCodexReport, IMMUNE_OUTPUT_REJECTED.
 */
const { createAutonomousWorkers } = require('./agentFleetWorkers');
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
