'use strict';

const { activeExecution, updateExecution, finalizeExecution } = require('./executionStore');
const { setProjectState, setTaskStatus, bumpAttempt } = require('./projectStore');
const { recordMemory } = require('./memoryService');
const { notify } = require('./notificationService');

async function stopExecution(db, ctx, harness) {
  const run = await activeExecution(db, ctx.project.id);
  if (!run) return true;
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
  if (run.phase === 'finished' || run.phase === 'verified') return { workerResult: 'done', run };
  const observed = await harness.observe(run);
  if (observed.alive) {
    const deadline = Date.parse(run.started_at) + JSON.parse(run.budgets_json).seconds * 1000;
    if (Date.now() < deadline) return { run };
    if (!await harness.stop(run)) return { run };
  }
  if (run.phase === 'prepared' && Date.now() - Date.parse(run.started_at) < 30000) return { run };
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
  const run = await activeExecution(db, ctx.project.id);
  if (run) {
    await finalizeExecution(db, { run, phase: 'failed' });
    await bumpAttempt(db, run.task_id);
    await setTaskStatus(db, { taskId: run.task_id, status: 'todo' });
    await db.run("UPDATE ontogenesis_runs SET status = 'unverified' WHERE id = ?", [run.id]);
  }
  await recordMemory(db, { projectId: ctx.project.id, kind: 'failure', content: error.message, provenance: { operationId: run && run.id } });
  await setProjectState(db, { projectId: ctx.project.id, state: 'WAITING_INPUT' });
  await notify(db, { projectId: ctx.project.id, kind: 'blocked', payload: { reason: error.message } });
  return { state: 'WAITING_INPUT', note: error.message };
}

module.exports = { haltForControl, observeExecution, failExecution, stopExecution };
