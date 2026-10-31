'use strict';

const { activeExecution, updateExecution, markExecutionInterrupted, finalizeExecution } = require('./executionStore');
const { setProjectState, setTaskStatus, bumpAttempt } = require('./projectStore');
const { recordMemory } = require('./memoryService');
const { notify } = require('./notificationService');
const { failureState } = require('./failurePolicy');
const daemonStewardship = require('./daemonStewardshipService');
const ledger = require('./ledgerService');

async function stopExecution(db, ctx, harness) {
  const run = await activeExecution(db, ctx.project.id);
  if (!run) return true;
  const finalStop = ['stopping', 'stopped'].includes(ctx.control?.mode);
  if (!finalStop && ['finished', 'verified'].includes(run.phase)) return true;
  if (!await harness.stop(run)) return false;
  await finalizeExecution(db, { run, phase: 'suspended' });
  await setTaskStatus(db, { taskId: run.task_id, status: 'todo' });
  await db.run("UPDATE ontogenesis_runs SET status = 'failed' WHERE id = ?", [run.id]);
  return true;
}

async function haltForControl(db, ctx, harness) {
  const mode = ctx.control && ctx.control.mode;
  const halt = ['paused', 'stopping', 'stopped'].includes(mode) || ctx.memoryLevel === 'critical';
  if (!halt) return null;
  if (ctx.project.state === 'STOPPED') return { state: 'STOPPED', note: 'arrete' };
  if (!await stopExecution(db, ctx, harness)) return { state: ctx.project.state, note: 'attente-arret-workers' };
  const state = mode === 'paused' ? 'PAUSED' : ['stopping', 'stopped'].includes(mode) ? 'STOPPED' : 'SLEEPING_RESOURCE';
  await setProjectState(db, { projectId: ctx.project.id, state });
  if (state === 'STOPPED') await db.run("UPDATE ontogenesis_control SET mode = 'stopped' WHERE project_id = ?", [ctx.project.id]);
  return { state, event: state === 'STOPPED' ? 'done' : 'resource' };
}

async function observeExecution(db, ctx, harness) {
  const run = await activeExecution(db, ctx.project.id);
  if (!run) return failState(db, ctx, 'execution-introuvable');
  { const __genosStageResult3 = require('./executionLifecycleStages1.js').observeExecutionStage3({ run }); if (__genosStageResult3) return __genosStageResult3.value; }
  const observed = await harness.observe(run);
  // The mission process may persist its terminal result while the harness is
  // observing it. Re-read before marking a dead process interrupted, and use a
  // compare-and-set below so this observer cannot overwrite that result.
  const latest = await activeExecution(db, ctx.project.id);
  { const __genosStageResult1 = require('./executionLifecycleStages1.js').observeExecutionStage1({ latest, run }); if (__genosStageResult1) return __genosStageResult1.value; }
  { const __genosStageResult5 = require('./executionLifecycleStages1.js').observeExecutionStage5({ latest }); if (__genosStageResult5) return __genosStageResult5.value; }
  { const __genosStageResult2 = await require('./executionLifecycleStages1.js').observeExecutionStage2({ Date, JSON, harness, latest, observed, run }); if (__genosStageResult2) return __genosStageResult2.value; }
  { const __genosStageResult6 = require('./executionLifecycleStages1.js').observeExecutionStage6({ Date, latest }); if (__genosStageResult6) return __genosStageResult6.value; }
  const interrupted = await markExecutionInterrupted(db, { id: latest.id });
  if (!interrupted) {
    const raced = await activeExecution(db, ctx.project.id);
    return { workerResult: 'done', run: raced || latest };
  }
  { const __genosStageResult4 = require('./executionLifecycleStages1.js').observeExecutionStage4({ Date, run }); if (__genosStageResult4) return __genosStageResult4.value; }
  await updateExecution(db, { id: run.id, phase: 'finished', result: { success: false, error: 'runtime-interrompu' } });
  return { workerResult: 'done', run: await activeExecution(db, ctx.project.id) };
}

async function failState(db, ctx, reason) {
  await setProjectState(db, { projectId: ctx.project.id, state: 'WAITING_INPUT' });
  ctx.project.state = 'WAITING_INPUT';
  await notify(db, { projectId: ctx.project.id, kind: 'blocked', payload: { reason } });
  return { state: 'WAITING_INPUT', note: reason };
}

async function failExecution(db, ctx, error) {
  const { withTransaction } = require('../../db');
  return withTransaction(db, () => settleFailedExecution(db, ctx, error));
}

async function settleFailedExecution(db, ctx, error) {
  const run = await activeExecution(db, ctx.project.id);
  if (run) {
    await finalizeExecution(db, { run, phase: 'failed' });
    await recordFailedOutcome(db, { projectId: ctx.project.id, run, reason: error.message });
    await bumpAttempt(db, run.task_id);
    await setTaskStatus(db, { taskId: run.task_id, status: 'todo' });
    await db.run("UPDATE ontogenesis_runs SET status = 'unverified' WHERE id = ?", [run.id]);
  }
  await recordMemory(db, { projectId: ctx.project.id, kind: 'failure', content: error.message, provenance: { operationId: run && run.id, topology: run && run.topology, taskId: run && run.task_id } });
  let config = {};
  try { config = JSON.parse(ctx.project.config_json || '{}'); } catch (_) {}
  const state = await failureState({ db, run, error, maxAttempts: config.durability?.maxAttempts });
  if (run) await daemonStewardship.recordFailure(db, {
    projectId: ctx.project.id, taskId: run.task_id, reason: error.message
  }).catch(() => ({ recorded: false }));
  await setProjectState(db, { projectId: ctx.project.id, state });
  await notify(db, { projectId: ctx.project.id, kind: 'blocked', payload: { reason: error.message } });
  return { state, note: error.message };
}

async function recordFailedOutcome(db, input) {
  const task = await db.get('SELECT attempt FROM ontogenesis_backlog WHERE id = ?', [input.run.task_id]);
  let result = {};
  try { result = JSON.parse(input.run.result_json || '{}'); } catch (_) {}
  await ledger.recordOutcome(db, { projectId: input.projectId, executionId: input.run.id,
    taskId: input.run.task_id, attempt: task ? task.attempt + 1 : null, outcome: 'failed',
    topology: input.run.topology, treeHash: result.treeHash, proofRefs: result.proofs || [], reason: input.reason });
}

module.exports = { haltForControl, observeExecution, failExecution, stopExecution };
