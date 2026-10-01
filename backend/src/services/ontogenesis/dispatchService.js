'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../db');
const { selectTopology } = require('./topologySelector');
const { listFailures } = require('./memoryService');
const { createExecution } = require('./executionStore');
const { reservationFor } = require('./resourceGuard');
const { notify } = require('./notificationService');

function allocatedBudget(remaining, config) {
  const limit = config.missionBudgets || { tokens: 40000, usd: 0.25, seconds: 120 };
  return Object.fromEntries(['tokens', 'usd', 'seconds'].map((key) => [key, Math.min(remaining[key], limit[key])]));
}

async function topologyFor(db, ctx) {
  const failures = await listFailures(db, ctx.project.id);
  return selectTopology({ taskKind: 'implement', allowedTopologies: ctx.config.topologies || [],
    availableCapabilities: ctx.config.availableCapabilities || ['execute', 'verify', 'coordinate', 'analyze', 'observe'],
    memoryLevel: ctx.memoryLevel, failures, variant: ctx.config.variant });
}

function canAdmit(ctx, reservationMb) {
  if (!ctx.sample) return true;
  const memory = ctx.config.memory;
  return ctx.sample.freeMb - memory.reserveMb - ctx.sample.reservationsMb >= reservationMb
    && ctx.ownedMb + reservationMb < memory.envelopeMb;
}

async function persistDispatch(db, input) {
  await withTransaction(db, async () => {
    await createExecution(db, input);
    await db.run("UPDATE ontogenesis_backlog SET status = 'doing' WHERE id = ? AND status = 'todo'", [input.taskId]);
    await db.run("UPDATE ontogenesis_projects SET state = 'EXECUTING' WHERE id = ?", [input.projectId]);
    await db.run(`INSERT INTO ontogenesis_runs (id, project_id, task_id, topology, variant, worker_json, budgets_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [input.id, input.projectId, input.taskId, input.topology, input.variant,
      JSON.stringify({ agentId: input.id }), JSON.stringify(input.budgets)]);
  });
}

async function dispatchTask(db, ctx, harness) {
  if (!Array.isArray(ctx.config.checks) || !ctx.config.checks.length) return blockDispatch(db, ctx, 'verifications-requises');
  const selection = await topologyFor(db, ctx);
  if (selection.blocked) return blockDispatch(db, ctx, selection.blocked);
  const reservationMb = reservationFor(ctx);
  if (!canAdmit(ctx, reservationMb)) return { state: ctx.project.state, note: 'enveloppe-insuffisante' };
  const workspace = await harness.prepare(ctx.project);
  const task = ctx.selection.task;
  const input = { id: `onto_run_${randomUUID()}`, projectId: ctx.project.id, taskId: task.id,
    ...workspace, topology: selection.topology, variant: selection.variant, reservationMb,
    budgets: allocatedBudget(ctx.remaining, ctx.config) };
  await ctx.fence();
  await persistDispatch(db, input);
  try {
    const started = await harness.start({ ...input, project: ctx.project, task, selection, config: ctx.config });
    await db.run('UPDATE ontogenesis_execution SET pid = ?, executable = ? WHERE id = ?', [started.pid, started.executable, input.id]);
    return { state: 'EXECUTING', event: 'dispatch', operationId: input.id };
  } catch (error) {
    await db.run("UPDATE ontogenesis_execution SET phase = 'finished', result_json = ? WHERE id = ?", [JSON.stringify({ success: false, error: error.message }), input.id]);
    return { state: 'EXECUTING', note: 'dispatch-echoue' };
  }
}

async function blockDispatch(db, ctx, reason) {
  await db.run("UPDATE ontogenesis_projects SET state = 'WAITING_INPUT' WHERE id = ?", [ctx.project.id]);
  await notify(db, { projectId: ctx.project.id, kind: 'blocked', payload: { reason } });
  return { state: 'WAITING_INPUT', note: reason };
}

module.exports = { dispatchTask, allocatedBudget };
