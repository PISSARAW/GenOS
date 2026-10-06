'use strict';

const crypto = require('node:crypto');
const ledger = require('./gvxDevelopmentLedger');
const leases = require('./gvxRuntimeLease');

function cycleId(signal) {
  return crypto.createHash('sha256').update(JSON.stringify([signal.scope.organizationId,
    signal.scope.projectId, signal.entityId, signal.sourceEventId, signal.signalType])).digest('hex');
}

async function runStage(context, stage, execute) {
  await leases.assertOwned(context.lease);
  const id = `gvx-cycle:${context.cycleId}:${stage}`;
  const scope = { ...context.signal.scope, entityId: context.signal.entityId };
  const prior = await ledger.getEvent(context.db, id, scope);
  if (prior) return prior.payload.value;
  try {
    const value = await execute(`gvx-cycle-operation:${context.cycleId}:${stage}`);
    await leases.assertOwned(context.lease);
    if (context.isComplete && !context.isComplete(stage, value)) return value;
    await ledger.appendEvent(context.db, { id, ...scope, type: 'decision_recorded',
      payload: { kind: 'gvx_cycle_stage', cycleId: context.cycleId, stage, value } });
    return value;
  } catch (error) {
    await ledger.appendEvent(context.db, { ...scope, type: 'decision_recorded',
      payload: { kind: 'gvx_cycle_failure', cycleId: context.cycleId, stage,
        retryable: true, errorCode: error.code || 'GVX_STAGE_FAILED' } }).catch(() => {});
    throw error;
  }
}

async function runCycle(context, execute) {
  const id = cycleId(context.signal);
  const lane = JSON.stringify([context.signal.scope, context.signal.entityId]);
  return leases.withLease({ db: context.db, lane }, async (lease) => {
    const state = { ...context, cycleId: id, lease };
    const fingerprint = await runStage(state, 'controls', async () => context.input.controlFingerprint);
    if (fingerprint !== context.input.controlFingerprint) {
      throw Object.assign(new Error('GVX cycle controls changed.'), { code: 'GVX_CYCLE_CONTROLS_CHANGED' });
    }
    const completed = await ledger.getEvent(context.db, `gvx-cycle:${id}:completed`,
      { ...context.signal.scope, entityId: context.signal.entityId });
    if (completed) return { ...completed.payload.value, replayed: true };
    const result = await execute(state);
    if (['monitoring', 'rollback_failed'].includes(result.status)) return result;
    return runStage(state, 'completed', async () => result);
  });
}

module.exports = { cycleId, runStage, runCycle };
