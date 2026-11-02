'use strict';

const context = require('./context');
const { withTransaction } = require('../../db');

async function initialize(ctx) {
  ctx.protocolBinding = await context.build(ctx);
  return ctx.protocolBinding;
}

async function beforeExecution(ctx) {
  if (ctx.protocolBinding) await context.assertCurrent(ctx.protocolBinding);
}

async function guardEvent(db, input) {
  const runId = input.event?.payload?.executionRunId;
  if (!runId) return null;
  const binding = await context.load(db, runId);
  if (!binding) return null;
  if (binding.agentId !== input.agentId) throw context.failure('MISSION_PROTOCOL_EVENT_SCOPE_MISMATCH');
  await context.assertCurrent(binding);
  await require('./evidence').guardEvent(binding, input.event);
  return binding;
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
