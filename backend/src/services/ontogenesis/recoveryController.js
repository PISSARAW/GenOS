'use strict';

const { activeExecution, finalizeExecution } = require('./executionStore');
const { setProjectState } = require('./projectStore');
const { notify } = require('./notificationService');

const PHASE_STATES = { prepared: 'EXECUTING', running: 'EXECUTING', finished: 'VERIFYING', verified: 'INTEGRATING' };

async function cancelBlockedTask(db, ctx) {
  const run = await activeExecution(db, ctx.project.id);
  if (!run) return null;
  const task = await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [run.task_id]);
  if (task?.status !== 'blocked') return null;
  if (!await ctx.harness.stop(run)) return { state: ctx.project.state, note: 'attente-arret-tache' };
  await finalizeExecution(db, { run, phase: 'cancelled' });
  await db.run("UPDATE ontogenesis_runs SET status = 'failed' WHERE id = ?", [run.id]);
  await setProjectState(db, { projectId: ctx.project.id, state: 'PLANNING' });
  return { state: 'PLANNING', note: 'tache-arretee' };
}

async function reconcileExecution(db, ctx) {
  if (ctx.control?.mode !== 'running') return;
  const run = await activeExecution(db, ctx.project.id);
  if (run) {
    if (!['PLANNING', 'IDLE'].includes(ctx.project.state)) return;
    const state = PHASE_STATES[run.phase];
    await setProjectState(db, { projectId: ctx.project.id, state });
    ctx.project.state = state;
    return;
  }
  if (!['PLANNING', 'EXECUTING'].includes(ctx.project.state)) return;
  const orphan = ctx.tasks.find((task) => task.status === 'doing');
  if (!orphan) return;
  await setProjectState(db, { projectId: ctx.project.id, state: 'WAITING_INPUT' });
  ctx.project.state = 'WAITING_INPUT';
  await notify(db, { projectId: ctx.project.id, kind: 'blocked',
    payload: { reason: 'tache-sans-execution', taskId: orphan.id } });
}

module.exports = { reconcileExecution, cancelBlockedTask };
