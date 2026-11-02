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
  return binding;
}

async function recordEvent(db, input) {
  return withTransaction(db, async () => {
    await guardEvent(db, input);
    return input.apply();
  });
}

module.exports = { initialize, beforeExecution, guardEvent, recordEvent };
