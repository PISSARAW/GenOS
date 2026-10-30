'use strict';

async function dispatchWorkerRecoveryStage1(__genosStageScope1) {
try {
    const bisectionResult = await (0, __genosStageScope1.runAutomaticBisection)(__genosStageScope1.db, __genosStageScope1.source, { mission: __genosStageScope1.mission, report: __genosStageScope1.report, decision: __genosStageScope1.decision, orchestratorId: __genosStageScope1.orchestratorId, sourceAgentId: __genosStageScope1.sourceAgentId });
    __genosStageScope1.target = (0, __genosStageScope1.resolveRecoveryTarget)({ sourceAgentId: __genosStageScope1.sourceAgentId, source: __genosStageScope1.source, recovery: __genosStageScope1.recovery, orchestratorId: __genosStageScope1.orchestratorId });
    (0, __genosStageScope1.addWorkerToBarrier)(__genosStageScope1.recoveryBarrier, __genosStageScope1.target.targetId);
    await __genosStageScope1.workerGarage.releaseStaleWorkerClaims(__genosStageScope1.db, __genosStageScope1.sourceAgentId);
    await (0, __genosStageScope1.persistRecoveryAgent)(__genosStageScope1.db, __genosStageScope1.source, __genosStageScope1.target);
    const garage = await __genosStageScope1.workerGarage.reserveSlot(__genosStageScope1.db, { orchestratorId: __genosStageScope1.orchestratorId, workerId: __genosStageScope1.target.targetId, name: __genosStageScope1.target.name, role: __genosStageScope1.target.role, mission: __genosStageScope1.target.prompt });
    __genosStageScope1.workspace = await (0, __genosStageScope1.createRecoveryWorkspace)({ db: __genosStageScope1.db, source: __genosStageScope1.source, mission: __genosStageScope1.mission, target: __genosStageScope1.target });
    const nextVariant = (0, __genosStageScope1.emitRecoveryDispatch)(__genosStageScope1.orchestratorId, __genosStageScope1.target, { sourceAgentId: __genosStageScope1.sourceAgentId, report: __genosStageScope1.report, decision: __genosStageScope1.decision, garage, mission: __genosStageScope1.mission });
    const stopped = await (0, __genosStageScope1.require)('./recoveryAdmission').beforeLaunch({ mission: __genosStageScope1.mission, barrier: __genosStageScope1.recoveryBarrier, durableItem: __genosStageScope1.recovery.durableItem });
    if (stopped) {
      await __genosStageScope1.durableQueue.finish(__genosStageScope1.recovery.durableItem, stopped);
      await (0, __genosStageScope1.cancelRecoveryDispatch)(__genosStageScope1.db, __genosStageScope1.target, __genosStageScope1.workspace);
      return { value: ( false) };
    }
    const recoveryMission = (0, __genosStageScope1.require)('./recoveryDeadline').limit((0, __genosStageScope1.buildRecoveryMission)({ mission: __genosStageScope1.mission, sourceAgentId: __genosStageScope1.sourceAgentId, target: __genosStageScope1.target, workspace: __genosStageScope1.workspace, bisectionResult, report: __genosStageScope1.report, orchestratorId: __genosStageScope1.orchestratorId, decision: __genosStageScope1.decision, nextVariant }));
    await (0, __genosStageScope1.startMission)(recoveryMission);
    __genosStageScope1.missionDispatched = true;
    await __genosStageScope1.durableQueue.finish(__genosStageScope1.recovery.durableItem, 'dispatched');
    return { value: ( true) };
  } catch (error) {
    await (0, __genosStageScope1.handleRecoveryDispatchFailure)(__genosStageScope1.db, error, { recovery: __genosStageScope1.recovery, sourceAgentId: __genosStageScope1.sourceAgentId, report: __genosStageScope1.report, decision: __genosStageScope1.decision, recoveryBarrier: __genosStageScope1.recoveryBarrier, workspace: __genosStageScope1.workspace, target: __genosStageScope1.target, orchestratorId: __genosStageScope1.orchestratorId });
    return { value: ( false) };
  } finally {
    if (__genosStageScope1.claimHeartbeat) (0, __genosStageScope1.clearInterval)(__genosStageScope1.claimHeartbeat);
    __genosStageScope1.activeWorkerRecoveryDispatches.delete(__genosStageScope1.sourceAgentId);
    // A same-identity recovery can fail while this dispatch is still active.
    // queueWorkerRecovery refreshes the pending entry, but its shutdown hook
    // cannot dispatch until this active lease is released. Drain that entry
    // after a successful launch; dispatch failures already have their own
    // bounded retry/backoff path in handleRecoveryDispatchFailure.
    if (__genosStageScope1.missionDispatched && __genosStageScope1.pendingWorkerRecoveries.has(__genosStageScope1.sourceAgentId)) {
      const barrier = __genosStageScope1.activeWorkerBarriers.get(__genosStageScope1.orchestratorId);
      if (!(0, __genosStageScope1.isCancelled)(barrier)) (0, __genosStageScope1.setTimeout)(() => { (0, __genosStageScope1.dispatchWorkerRecovery)(__genosStageScope1.sourceAgentId); }, 0).unref();
    }
  }
}

function dispatchWorkerRecoveryStage2(__genosStageScope2) {
if (__genosStageScope2.recovery && !__genosStageScope2.pendingWorkerRecoveries.has(__genosStageScope2.sourceAgentId)) __genosStageScope2.pendingWorkerRecoveries.set(__genosStageScope2.sourceAgentId, __genosStageScope2.recovery);
}

module.exports = { dispatchWorkerRecoveryStage1, dispatchWorkerRecoveryStage2 };
