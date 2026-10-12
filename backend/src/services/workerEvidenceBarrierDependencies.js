'use strict';

const { workerEvidenceDossiers } = require('./agentEvidenceService');
const { latestReport } = require('./trinityComparativeBarrier');
const handoffEvidence = require('./aTeamHandoffEvidenceService');
const externalRecovery = require('./workerExternalRecoveryPipeline');

function indexWorkersByKey(workers) {
  const byKey = new Map();
  for (const worker of workers) {
    byKey.set(worker.agentId, worker);
    byKey.set(worker.label, worker);
    byKey.set(worker.subSystem, worker);
  }
  return byKey;
}

function checkSingleDependency(worker, dependency, byKey) {
  const prerequisite = byKey.get(dependency);
  const prior = prerequisite?.pipelineStage ?? 0;
  const own = worker.pipelineStage ?? 0;
  if (!prerequisite || prerequisite.agentId === worker.agentId || prior >= own) {
    throw Object.assign(new Error(`Worker '${worker.label}' has an invalid dependency '${dependency}'.`), {
      code: 'INVALID_WORKER_DEPENDENCY'
    });
  }
}

function validateWorkerDependencies(workers, byKey) {
  for (const worker of workers) {
    for (const dependency of worker.dependsOn || []) checkSingleDependency(worker, dependency, byKey);
  }
}

function collectStages(workers) {
  return [...new Set(workers.map((worker) => worker.pipelineStage ?? 0))].sort((a, b) => a - b);
}

function workersForStage(workers, stage) {
  return workers.filter((worker) => (worker.pipelineStage ?? 0) === stage);
}

function prerequisiteHasEvidence(orchestratorId, prerequisite) {
  const dossier = workerEvidenceDossiers(orchestratorId, [prerequisite])
    .find((item) => item.workerId === prerequisite.agentId);
  const report = latestReport(dossier);
  if (externalRecovery.isRecovery(prerequisite)) return externalRecovery.validReport(prerequisite, report);
  return handoffEvidence.reportIsUsable(report, prerequisite.requiredArtifacts || prerequisite.outputs || []);
}

function missingPrerequisiteEvidence(orchestratorId, prerequisites, byKey) {
  return [...prerequisites].filter((key) => {
    const prerequisite = byKey.get(key);
    return !prerequisite || !prerequisiteHasEvidence(orchestratorId, prerequisite);
  });
}

async function throwIfStageBlocked(ctx) {
  const missing = missingPrerequisiteEvidence(ctx.orchestratorId, ctx.prerequisites, ctx.byKey);
  if (missing.length) throw stageBlocked(ctx.stage, missing.join(', '));
  for (const dependency of ctx.prerequisites) {
    const prerequisite = ctx.byKey.get(dependency);
    if (!await hasDurableCompletion(ctx.db, prerequisite.agentId)) throw stageBlocked(ctx.stage, dependency);
  }
}

async function hasDurableCompletion(db, agentId) {
  const run = await db.get(`SELECT id FROM strategy_execution_runs
    WHERE agent_id=? AND status='completed' ORDER BY created_at DESC LIMIT 1`, agentId);
  if (!run?.id) return false;
  const events = await db.all(`SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='AGENT_COMPLETED' ORDER BY rowid DESC LIMIT 20`, agentId);
  return events.some((event) => matchesRun(event.payload_json, run.id));
}

function matchesRun(payloadJson, runId) {
  try { return JSON.parse(payloadJson || '{}').executionRunId === runId; }
  catch (_) { return false; }
}

function stageBlocked(stage, dependency) {
  return Object.assign(new Error(`Pipeline stage ${stage} is blocked by incomplete dependency '${dependency}'.`), {
    code: 'WORKER_DEPENDENCY_NOT_READY'
  });
}

module.exports = { indexWorkersByKey, validateWorkerDependencies, collectStages,
  workersForStage, throwIfStageBlocked };
