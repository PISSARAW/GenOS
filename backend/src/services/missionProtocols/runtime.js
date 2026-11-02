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
  return withTransaction(db, async () => {
    const binding = await guardEvent(db, input);
    const saved = await input.apply();
    if (binding && saved) await require('./evidence').observe(binding, { event: input.event, saved });
    return saved;
  });
}

module.exports = { initialize, beforeExecution, guardEvent, recordEvent };
