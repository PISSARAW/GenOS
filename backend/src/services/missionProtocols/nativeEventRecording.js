'use strict';

const context = require('./context');
const NATIVE_REJECTION = 'ORACLE_ASSEMBLY_NOT_ACCEPTED';

async function record(db, input) {
  let binding;
  try { binding = await input.guard(db, input); }
  catch (failure) { return rejected(db, { input, failure }); }
  const saved = await input.apply();
  if (binding && saved) await require('./evidence').observe(binding, { event: input.event, saved });
  return saved;
}

async function rejected(db, request) {
  const { input, failure } = request;
  if (failure.code !== NATIVE_REJECTION || input.event?.eventType !== 'AGENT_COMPLETED'
    || !input.event.payload?.nativeOracleRef) throw failure;
  const binding = await context.load(db, input.event.payload.executionRunId);
  if (!binding || binding.agentId !== input.agentId) throw failure;
  await context.assertCurrent(binding);
  const saved = await input.apply();
  await context.assertCurrent(binding);
  if (!nativeBlock(saved, binding)) throw context.failure('MISSION_EVIDENCE_NATIVE_REJECTION_REQUIRED');
  return saved;
}

function nativeBlock(saved, binding) {
  const receipt = saved?.biologicalReceipt;
  return saved?.halt === true && saved.run?.id === binding.runId
    && saved.run.status === 'blocked' && saved.run.guardrailReason === NATIVE_REJECTION
    && receipt?.runId === binding.runId && receipt.workerId === binding.agentId
    && receipt.result?.verified === false;
}

module.exports = { record };
