'use strict';

const context = require('./context');
const { withTransaction } = require('../../db');

async function initialize(ctx) {
  ctx.protocolBinding = await context.build(ctx);
  if (ctx.protocolBinding) await require('./continuity').initialize(ctx.protocolBinding);
  return ctx.protocolBinding;
}

async function beforeExecution(ctx) {
  if (!ctx.protocolBinding) return;
  await context.assertCurrent(ctx.protocolBinding);
  await require('./continuity').beforeExecution(ctx.protocolBinding);
  await require('./synapse').beforeExecution(ctx.protocolBinding);
  return require('./allostasis').beforeExecution(ctx.protocolBinding);
}

async function guardEvent(db, input) {
  const runId = input.event?.payload?.executionRunId;
  if (!runId) {
    await assertExplicitRun(db, input.agentId);
    return null;
  }
  const binding = await context.load(db, runId);
  if (!binding) {
    await assertExplicitRun(db, input.agentId);
    return null;
  }
  if (binding.agentId !== input.agentId) throw context.failure('MISSION_PROTOCOL_EVENT_SCOPE_MISMATCH');
  await context.assertCurrent(binding);
  await require('./continuity').beforeEffect(binding, input.event);
  await require('./evidence').guardEvent(binding, input.event);
  return binding;
}

async function assertExplicitRun(db, agentId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_runs'");
  if (!table) return;
  const active = await db.get(`SELECT p.run_id FROM mission_protocol_runs p
    JOIN strategy_execution_runs r ON r.id=p.run_id WHERE p.agent_id=?
    AND r.status IN ('planned','running') LIMIT 1`, agentId);
  if (active) throw context.failure('MISSION_PROTOCOL_EVENT_RUN_REQUIRED');
}

async function recordEvent(db, input) {
  return withTransaction(db, () => require('./nativeEventRecording').record(db, { ...input, guard: guardEvent }));
}

async function finish(db, runId) {
  if (!runId) return null;
  const binding = await context.load(db, runId);
  return binding ? require('./allostasis').finish(binding) : null;
}

async function preemptAgent(agentId) {
  const db = await require('../../db').getDatabase();
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_runs'");
  if (!table) return null;
  const row = await db.get('SELECT run_id FROM mission_protocol_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', agentId);
  const binding = row && await context.load(db, row.run_id);
  return binding ? require('./allostasis').preempt(binding) : null;
}

async function runInProcess(ctx, execute) {
  try { return await execute(); }
  finally {
    try { await require('./gqwf').finishInProcess(ctx.db, { runId: ctx.executionRun.id }); }
    finally { await finish(ctx.db, ctx.executionRun.id); }
  }
}

module.exports = { initialize, beforeExecution, guardEvent, recordEvent, finish, preemptAgent, runInProcess };
