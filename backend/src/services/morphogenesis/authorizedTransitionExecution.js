'use strict';

const { withTransaction } = require('../../db');
const collective = require('../collectiveStateService');
const durableSnapshots = require('./morphogenesisTransitionSnapshotService');
const productionAuthority = require('./morphogenesisProductionAuthority');

async function persistCommit(input) {
  return withTransaction(input.ctx.db, async () => {
    const commit = await input.ctx.persistCommit(input.receipt);
    if (!commit?.id) throw new Error('Versioned transition commit did not return an immutable identifier.');
    await require('./morphogenesisHysteresisStore').commit({ db: input.ctx.db,
      organizationId: input.ctx.req.tenant.organizationId,
      projectId: input.ctx.req.tenant.projectId,
      missionId: input.ctx.missionId || input.ctx.plan.missionId || input.ctx.agentId,
      transitionId: input.ctx.transitionId,
      transition: input.receipt.rustAuthority.hysteresisTransition });
    await durableSnapshots.persistCollective({ db: input.ctx.db,
      state: input.ctx.collectiveState });
    await durableSnapshots.appendAction({ db: input.ctx.db,
      transitionId: input.ctx.transitionId,
      receipt: { schema: 'genos.morphogenesis-transition-phase/v1', phase: 'COMMIT',
        planHash: input.snapshot.planHash } });
    await durableSnapshots.markCommitted({ db: input.ctx.db, id: input.snapshot.id });
    return commit;
  });
}

async function rollback(input, ops) {
  const compensationErrors = await ops.compensateActions(
    input.compensations, input.ctx, input.error.message);
  let restored;
  try {
    restored = await durableSnapshots.restore({ db: input.ctx.db, id: input.snapshot.id,
      collectiveState: input.ctx.collectiveState, snapshotStore: input.ctx.snapshotStore,
      error: input.error.message });
    await durableSnapshots.appendAction({ db: input.ctx.db,
      transitionId: input.ctx.transitionId,
      receipt: { schema: 'genos.morphogenesis-transition-phase/v1', phase: 'ABORT',
        planHash: input.snapshot.planHash, reason: input.error.message } });
    if (compensationErrors.length) await durableSnapshots.markRecoveryRequired({
      db: input.ctx.db, id: input.snapshot.id, error: compensationErrors.join('; ') });
  } catch (restoreError) {
    compensationErrors.push(restoreError.message || String(restoreError));
    restored = { restored: false, snapshotId: input.snapshot.id };
  }
  return { rolledBack: restored.restored === true && compensationErrors.length === 0,
    durableRestored: restored.restored === true, externalCompensated: compensationErrors.length === 0,
    compensationErrors, targetSnapshotId: input.snapshot.id, domains: restored.domains || [],
    triggeredBy: input.error.message, timestamp: ops.nowIso() };
}

async function applyActions(input, ops) {
  for (const [index, action] of input.ctx.plan.actions.entries()) {
    if (durableSnapshots.digest(input.ctx.plan) !== input.planHash) {
      throw Object.assign(new Error('Transition plan changed after Rust PREPARE.'), {
        code: 'MORPHOGENESIS_PLAN_DIVERGED_AFTER_PREPARE' });
    }
    const actionId = `${input.ctx.transitionId}:${index}`;
    await durableSnapshots.appendAction({ db: input.ctx.db,
      transitionId: input.ctx.transitionId,
      receipt: { schema: 'genos.morphogenesis-action-intent/v1', phase: 'PREPARE',
        actionId, actionHash: durableSnapshots.digest(action), action } });
    const result = await ops.runAction(action, input.ctx);
    input.actionsTaken.push(result);
    if (result.status !== 'success') throw new Error(`action ${action.type} failed: ${result.error}`);
    // Register the compensator immediately after the external effect succeeds.
    // Receipt persistence can fail; the effect must still be undone on rollback.
    if (['spawn', 'retire', 'genome'].includes(action.type)) input.compensations.push({ action, result });
    await durableSnapshots.appendAction({ db: input.ctx.db,
      transitionId: input.ctx.transitionId,
      receipt: { schema: 'genos.morphogenesis-action-outcome/v1', phase: 'COMMIT',
        actionId, actionHash: durableSnapshots.digest(action), result } });
  }
}

function successfulReceipt(input, ops) {
  const migrationLog = ops.migrateState({ fromState: input.preState,
    toState: input.ctx.collectiveState, plan: input.ctx.plan });
  ops.verifyTransitionState({ plan: input.ctx.plan, collectiveState: input.ctx.collectiveState,
    preSnapshot: null, actionsTaken: input.actionsTaken });
  const postSnapshot = ops.createStateSnapshot(input.ctx.collectiveState);
  return { ...ops.buildReceipt({ transitionId: input.ctx.transitionId, plan: input.ctx.plan,
    preSnapshot: input.snapshot, postSnapshot, actionsTaken: input.actionsTaken,
    rollbackReceipt: null, committed: true }), durableSnapshot: input.snapshot,
  rustAuthority: input.authority, migrationLog };
}

async function runApplying(input, ops) {
  const actionsTaken = [];
  const compensations = [];
  try {
    if (durableSnapshots.digest(input.ctx.plan) !== input.snapshot.planHash) {
      throw Object.assign(new Error('Transition plan changed after Rust PREPARE.'), {
        code: 'MORPHOGENESIS_PLAN_DIVERGED_AFTER_PREPARE' });
    }
    await applyActions({ ctx: input.ctx, actionsTaken, compensations,
      planHash: input.snapshot.planHash }, ops);
    const receipt = successfulReceipt({ ...input, actionsTaken }, ops);
    receipt.commit = await persistCommit({ ctx: input.ctx, receipt, snapshot: input.snapshot });
    return receipt;
  } catch (error) {
    const rollbackReceipt = await rollback({ error, compensations, ctx: input.ctx,
      snapshot: input.snapshot }, ops);
    return { ...ops.buildReceipt({ transitionId: input.ctx.transitionId, plan: input.ctx.plan,
      preSnapshot: input.snapshot, postSnapshot: null, actionsTaken, rollbackReceipt,
      committed: false }), durableSnapshot: input.snapshot, rustAuthority: input.authority,
    code: error.code || 'MORPHOGENESIS_TRANSITION_FAILED', errors: [error.message || String(error)] };
  }
}

async function authorizeOrRestore(input) {
  try {
    const authority = await productionAuthority.authorize({ ...input.ctx, agentId: input.agentId,
      collectiveState: input.state, missionId: input.ctx.missionId,
      currentTopology: input.state.topologyState?.topology || input.state.topologyState?.organization
        || 'unconfigured', snapshot: input.snapshot });
    await durableSnapshots.markApplying({ db: input.ctx.db, id: input.snapshot.id, authority });
    return authority;
  } catch (error) {
    await restorePrepared({ ctx: input.ctx, snapshot: input.snapshot, state: input.state, error });
    throw error;
  }
}

async function restorePrepared(input) {
  try {
    await durableSnapshots.restore({ db: input.ctx.db, id: input.snapshot.id,
      collectiveState: input.state, snapshotStore: input.ctx.snapshotStore,
      error: input.error.message || String(input.error) });
    await durableSnapshots.appendAction({ db: input.ctx.db,
      transitionId: input.ctx.transitionId,
      receipt: { schema: 'genos.morphogenesis-transition-phase/v1', phase: 'ABORT',
        planHash: input.snapshot.planHash, reason: input.error.message || String(input.error) } });
  } catch (restoreError) {
    await durableSnapshots.markRecoveryRequired({ db: input.ctx.db, id: input.snapshot.id,
      error: `${input.error.message || String(input.error)}; restore_failed:${restoreError.message}` });
    throw restoreError;
  }
}

async function execute(ctx, transitionId, ops) {
  const state = ctx.collectiveState || ops.getState();
  const agentId = ctx.agentId || ctx.parent?.id;
  if (!ops.hasNoActiveConflict(ctx.plan, state)) throw new Error('active transition conflict');
  const snapshot = await durableSnapshots.capture({ ...ctx, agentId, transitionId,
    collectiveState: state });
  await durableSnapshots.appendAction({ db: ctx.db, transitionId,
    receipt: { schema: 'genos.morphogenesis-transition-phase/v1', phase: 'PREPARE',
      planHash: snapshot.planHash, snapshotId: snapshot.id, snapshotHash: snapshot.hash } });
  const loaded = await durableSnapshots.load({ db: ctx.db, id: snapshot.id });
  const preState = collective.deserializeState(loaded.payload.collectiveState);
  const authority = await authorizeOrRestore({ ctx, snapshot, state, agentId });
  const morphCtx = { ...ctx, agentId, collectiveState: state, transitionId };
  return runApplying({ ctx: morphCtx, snapshot, authority, preState }, ops);
}

module.exports = { execute };
