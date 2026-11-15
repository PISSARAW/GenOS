'use strict';

async function prepareRecoveryDispatch(context) {
try {
    const bisectionResult = await context.runAutomaticBisection(context.db, context.source, { mission: context.mission, report: context.report, decision: context.decision, orchestratorId: context.orchestratorId, sourceAgentId: context.sourceAgentId });
    context.target = context.resolveRecoveryTarget({ sourceAgentId: context.sourceAgentId, source: context.source, recovery: context.recovery, orchestratorId: context.orchestratorId });
    context.addWorkerToBarrier(context.recoveryBarrier, context.target.targetId);
    await context.workerGarage.releaseStaleWorkerClaims(context.db, context.sourceAgentId);
    await context.persistRecoveryAgent(context.db, context.source, context.target);
    const garage = await context.workerGarage.reserveSlot(context.db, { orchestratorId: context.orchestratorId, workerId: context.target.targetId, name: context.target.name, role: context.target.role, mission: context.target.prompt });
    context.workspace = await context.createRecoveryWorkspace({ db: context.db, source: context.source, mission: context.mission, target: context.target });
    const nextVariant = context.emitRecoveryDispatch(context.orchestratorId, context.target, { sourceAgentId: context.sourceAgentId, report: context.report, decision: context.decision, garage, mission: context.mission });
    const stopped = await context.require('./recoveryAdmission').beforeLaunch({ mission: context.mission, barrier: context.recoveryBarrier, durableItem: context.recovery.durableItem });
    if (stopped) {
      await context.durableQueue.finish(context.recovery.durableItem, stopped);
      await context.cancelRecoveryDispatch(context.db, context.target, context.workspace);
      return { value: ( false) };
    }
    const recoveryMission = context.require('./recoveryDeadline').limit(context.buildRecoveryMission({ mission: context.mission, sourceAgentId: context.sourceAgentId, target: context.target, workspace: context.workspace, bisectionResult, report: context.report, orchestratorId: context.orchestratorId, decision: context.decision, nextVariant }));
    await context.startMission(recoveryMission);
    await require('./recoveryContinuity').adopt(context.db, { mission: recoveryMission,
      sourceAgentId: context.sourceAgentId });
    context.missionDispatched = true;
    await context.durableQueue.finish(context.recovery.durableItem, 'dispatched');
    return { value: ( true) };
  } catch (error) {
    await context.handleRecoveryDispatchFailure(context.db, error, { recovery: context.recovery, sourceAgentId: context.sourceAgentId, report: context.report, decision: context.decision, recoveryBarrier: context.recoveryBarrier, workspace: context.workspace, target: context.target, orchestratorId: context.orchestratorId });
    return { value: ( false) };
  } finally {
    await require('./queueWorkerRecovery').waitForRecoveryWrites(context.sourceAgentId);
    if (context.claimHeartbeat) context.clearInterval(context.claimHeartbeat);
    context.activeWorkerRecoveryDispatches.delete(context.sourceAgentId);
    // A same-identity recovery can fail while this dispatch is still active.
    // queueWorkerRecovery refreshes the pending entry, but its shutdown hook
    // cannot dispatch until this active lease is released. Drain that entry
    // after a successful launch; dispatch failures already have their own
    // bounded retry/backoff path in handleRecoveryDispatchFailure.
    if (context.missionDispatched && context.pendingWorkerRecoveries.has(context.sourceAgentId)) {
      const barrier = context.activeWorkerBarriers.get(context.orchestratorId);
      if (!context.isCancelled(barrier)) context.setTimeout(() => { context.dispatchWorkerRecovery(context.sourceAgentId); }, 0).unref();
    }
  }
}

function dispatchWorkerRecovery(context) {
if (context.recovery && !context.pendingWorkerRecoveries.has(context.sourceAgentId)) context.pendingWorkerRecoveries.set(context.sourceAgentId, context.recovery);
}

module.exports = { prepareRecoveryDispatch, dispatchWorkerRecovery };
