'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../db');
const { selectTopology } = require('./topologySelector');
const { listFailures, listSimilarFailures, SIMILARITY_LIMIT } = require('./memoryService');
const { createExecution } = require('./executionStore');
const { reservationFor } = require('./resourceGuard');
const { notify } = require('./notificationService');
const { initiativeEnvelope, clampBudget } = require('../shev/initiativeAdmissionService');

function allocatedBudget(remaining, config) {
  const limit = config.missionBudgets || { tokens: 40000, usd: 0.25, seconds: 120 };
  return Object.fromEntries(['tokens', 'usd', 'seconds'].map((key) => [key, Math.min(remaining[key], limit[key])]));
}

const DEFAULT_CAPABILITIES = ['execute', 'verify', 'coordinate', 'analyze', 'observe'];

function inferTaskKind(task) {
  const title = String((task && (task.kind || task.title)) || '').toLowerCase();
  if (/conflit|resoudre|repare|repair|fix|regression/.test(title)) return 'repair';
  if (/verif|verify|controle|preuve|audit/.test(title)) return 'verify';
  if (/explor|recherche|cartograph|discover/.test(title)) return 'explore';
  if (/decid|choix|arbitrage|strategie/.test(title)) return 'decide';
  return 'implement';
}

function capabilitiesOf(config) {
  if (config.availableCapabilities === undefined) {
    return { list: DEFAULT_CAPABILITIES.slice(), defaulted: true };
  }
  if (!Array.isArray(config.availableCapabilities) || config.availableCapabilities.length === 0) {
    return { list: [], defaulted: false, blocked: 'capacites-non-declarees' };
  }
  return { list: config.availableCapabilities.slice(), defaulted: false };
}

async function topologyFor(db, ctx) {
  const failures = await listFailures(db, ctx.project.id);
  const capabilities = capabilitiesOf(ctx.config);
  if (capabilities.blocked) return { blocked: capabilities.blocked, rationale: [] };
  const task = (ctx.selection && ctx.selection.task) || {};
  const selection = selectTopology({ taskKind: task.kind || inferTaskKind(task), allowedTopologies: ctx.config.topologies || [],
    availableCapabilities: capabilities.list,
    memoryLevel: ctx.memoryLevel, failures, variant: ctx.config.variant });
  if (capabilities.defaulted) selection.rationale.unshift('capacites-par-defaut');
  return selection;
}

async function recordTopologyDecision(db, record) {
  const selection = record.selection;
  const evidence = {
    taskKind: selection.taskKind || null,
    memoryLevel: record.memoryLevel || null,
    variant: selection.variant || null,
    workerRoles: selection.workerRoles || [],
    failures: (record.failures || []).length
  };
  await db.run(
    `INSERT INTO ontogenesis_decisions (id, project_id, task_id, alternatives_json, rationale, evidence_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [`dec_${randomUUID()}`, record.projectId, record.taskId,
      JSON.stringify(selection.ordered || []),
      (selection.rationale || []).join('\n'),
      JSON.stringify(evidence)]
  );
}

async function traceSelection(db, ctx, selection) {
  try {
    const task = (ctx.selection && ctx.selection.task) || {};
    const failures = await listFailures(db, ctx.project.id);
    await recordTopologyDecision(db, {
      projectId: ctx.project.id, taskId: task.id || null,
      selection, memoryLevel: ctx.memoryLevel, failures
    });
  } catch (_) {
    // Traçabilité best-effort : un échec d'audit ne bloque jamais le dispatch.
  }
}

async function hasSimilarFailures(db, ctx) {
  const task = (ctx.selection && ctx.selection.task) || {};
  if (!task.id) return false;
  const similar = await listSimilarFailures(db, { projectId: ctx.project.id, text: `tache:${task.id}:${task.title || ''}` });
  return similar.length >= SIMILARITY_LIMIT;
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
  const envelope = await initiativeEnvelope(db, ctx.selection?.task);
  if (envelope?.blocked) return blockDispatch(db, ctx, envelope.blocked);
  const selection = await topologyFor(db, ctx);
  if (selection.blocked) return blockDispatch(db, ctx, selection.blocked);
  if (await hasSimilarFailures(db, ctx)) return blockDispatch(db, ctx, 'echec-similaire-repete');
  const reservationMb = reservationFor(ctx);
  if (!canAdmit(ctx, reservationMb)) return { state: ctx.project.state, note: 'enveloppe-insuffisante' };
  await ctx.fence();
  const workspace = await harness.prepare(ctx.project);
  const task = ctx.selection.task;
  const input = { id: `onto_run_${randomUUID()}`, projectId: ctx.project.id, taskId: task.id,
    ...workspace, topology: selection.topology, variant: selection.variant, reservationMb,
    budgets: clampBudget(allocatedBudget(ctx.remaining, ctx.config), envelope) };
  await persistDispatch(db, input);
  await traceSelection(db, ctx, selection);
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
