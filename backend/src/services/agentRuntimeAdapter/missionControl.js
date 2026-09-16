const { stopMissionChildren, stopPersistedRuntime } = require('./missionShutdown');
const { activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingContinuations, pendingWorkerRecoveries, emit } = require('../agentOrchestrationState');
const { terminateChild } = require('../processTermination');

async function stopMission(agentId) {
  pendingContinuations.delete(agentId);
  pendingWorkerRecoveries.delete(agentId);
  autonomousRounds.delete(agentId);
  cancelledStarts.add(agentId);

  let barrierStopped = false;
  const barrier = activeWorkerBarriers.get(agentId);
  if (barrier) {
    barrier.cancelled = true;
    activeWorkerBarriers.delete(agentId);
    await Promise.all([...barrier.workerIds].map((workerId) => stopMission(workerId)));
    barrierStopped = true;
  }

  if (await stopMissionChildren(agentId, stopMission)) barrierStopped = true;

  const child = activeProcesses.get(agentId);
  if (child) {
    child.genosStopRequested = true;
    terminateChild(child);
    return true;
  }

  if (missionStarts.has(agentId)) {
    return true;
  }

  const runtime = await stopPersistedRuntime(agentId);
  if (runtime.handled) return runtime.killed;

  return barrierStopped;
}

function stopAllMissions() {
  const ids = new Set([
    ...activeProcesses.keys(),
    ...missionStarts.keys(),
    ...activeWorkerBarriers.keys(),
    ...pendingContinuations.keys(),
    ...pendingWorkerRecoveries.keys()
  ]);
  for (const agentId of ids) {
    cancelledStarts.add(agentId);
    pendingContinuations.delete(agentId);
    pendingWorkerRecoveries.delete(agentId);
    stopMission(agentId);
  }
  return [...ids];
}

module.exports = { stopMission, stopAllMissions };