/**
 * Quiescence wait for delegated workers: stable terminal observation.
 */
const {
  activeProcesses,
  missionStarts,
  autonomousRounds,
  activeWorkerBarriers,
  pendingContinuations,
  pendingWorkerRecoveries,
  activeWorkerRecoveryDispatches,
  TERMINAL_AGENT_STATUSES
} = require('./agentOrchestrationState');

// Barrier-settled states: lifecycle-terminal states plus `idle` (initial or
// re-armed, nothing running) and `blocked` (budget/operator halt: nothing
// will progress without intervention). Quiescence asks "is anything still
// running?", which is a different question from "is the lifecycle over?".
const QUIESCENT_AGENT_STATUSES = new Set([...TERMINAL_AGENT_STATUSES, 'idle', 'blocked']);

function resolveTimeoutMs(options) {
  if (!options) return 60000;
  if (options.timeoutMs === undefined) return 60000;
  if (options.timeoutMs === null) return 60000;
  return Number(options.timeoutMs);
}

function resolvePollMs(options) {
  if (!options) return 100;
  if (options.pollMs === undefined) return 100;
  if (options.pollMs === null) return 100;
  return Number(options.pollMs);
}

function resolveIgnoreRound(options) {
  if (!options) return false;
  if (options.ignoreRoundPending === true) return true;
  return false;
}

function readCancelFlag(options) {
  if (!options) return false;
  if (typeof options.isCancelled !== 'function') return false;
  return options.isCancelled();
}

function trackedIdSet(orchestratorId, initialIds) {
  const barrier = activeWorkerBarriers.get(orchestratorId);
  if (!barrier) return new Set(initialIds);
  if (!barrier.workerIds) return new Set(initialIds);
  return new Set(barrier.workerIds);
}

function placeholdersFor(ids) {
  const parts = [];
  for (const id of ids) {
    void id;
    parts.push('?');
  }
  return parts.join(',');
}

async function fetchBarrierAgents(db, orchestratorId, ids) {
  if (ids.length === 0) return [];
  const placeholders = placeholdersFor(ids);
  const rows = await db.all('SELECT id, status FROM agents WHERE parent_agent_id = ? AND id IN (' + placeholders + ')', orchestratorId, ...ids);
  if (Array.isArray(rows)) return rows;
  return [];
}

function isRuntimePending(workerId) {
  if (activeProcesses.has(workerId)) return true;
  if (missionStarts.has(workerId)) return true;
  if (pendingContinuations.has(workerId)) return true;
  if (pendingWorkerRecoveries.has(workerId)) return true;
  if (activeWorkerRecoveryDispatches.has(workerId)) return true;
  return false;
}

function missingThreshold(startTime, timeoutMs) {
  const elapsed = Date.now() - startTime;
  const cap = Math.min(timeoutMs, 3000);
  if (elapsed >= cap) return true;
  return false;
}

function missingErrorText(missingId, orchestratorId) {
  return 'Autonomous worker \'' + String(missingId) + '\' of orchestrator \'' + String(orchestratorId) + '\' is missing from database and runtime state.';
}

function noteMissingId(state, missingId) {
  const prior = state.missingChecks.get(missingId);
  if (prior === undefined) {
    state.missingChecks.set(missingId, 1);
    return;
  }
  state.missingChecks.set(missingId, prior + 1);
}

function checkMissingThreshold(state, missingId) {
  const count = state.missingChecks.get(missingId);
  if (count === undefined) return false;
  if (count < 10) return false;
  return missingThreshold(state.startTime, state.timeoutMs);
}

function throwIfMissingExpired(state, missingId) {
  if (checkMissingThreshold(state, missingId) === false) return;
  const error = new Error(missingErrorText(missingId, state.orchestratorId));
  error.code = 'WORKER_NOT_FOUND';
  throw error;
}

function observeMissingIds(state, missingIds) {
  for (const missingId of missingIds) {
    if (isRuntimePending(missingId)) {
      state.missingChecks.delete(missingId);
      continue;
    }
    noteMissingId(state, missingId);
    throwIfMissingExpired(state, missingId);
  }
}

function areStatusesTerminal(agents, trackedSize) {
  if (agents.length !== trackedSize) return false;
  for (const agent of agents) {
    if (QUIESCENT_AGENT_STATUSES.has(agent.status)) continue;
    return false;
  }
  return true;
}

function hasRuntimePending(ids) {
  for (const id of ids) {
    if (isRuntimePending(id)) return true;
  }
  return false;
}

function hasRoundPending(orchestratorId, ignoreRound) {
  if (ignoreRound) return false;
  return autonomousRounds.has(orchestratorId);
}

function sleepMs(pollMs) {
  return new Promise((resolve) => setTimeout(resolve, pollMs));
}

function cancelledError(orchestratorId) {
  const error = new Error('Worker evidence barrier for \'' + String(orchestratorId) + '\' was stopped by the operator.');
  error.code = 'WORKER_BARRIER_CANCELLED';
  return error;
}

function timeoutError(orchestratorId) {
  const error = new Error('Timed out waiting for all autonomous workers of \'' + String(orchestratorId) + '\' to become quiescent.');
  error.code = 'WORKER_BARRIER_TIMEOUT';
  return error;
}

function collectMissingIds(ids, foundIds) {
  const missing = [];
  for (const id of ids) {
    if (foundIds.has(id)) continue;
    missing.push(id);
  }
  return missing;
}

function collectFoundIds(agents) {
  const found = new Set();
  for (const agent of agents) {
    found.add(agent.id);
  }
  return found;
}

async function pollOnce(state) {
  const tracked = trackedIdSet(state.orchestratorId, state.initialIds);
  const ids = [...tracked];
  const agents = await fetchBarrierAgents(state.db, state.orchestratorId, ids);
  const foundIds = collectFoundIds(agents);
  const missingIds = collectMissingIds(ids, foundIds);
  observeMissingIds(state, missingIds);
  const terminal = areStatusesTerminal(agents, tracked.size);
  const runtimeBusy = hasRuntimePending(ids);
  const roundBusy = hasRoundPending(state.orchestratorId, state.ignoreRound);
  return { agents: agents, terminal: terminal, runtimeBusy: runtimeBusy, roundBusy: roundBusy };
}

function isQuiescent(observation) {
  if (observation.terminal === false) return false;
  if (observation.runtimeBusy) return false;
  if (observation.roundBusy) return false;
  return true;
}

async function waitForAutonomousWorkerQuiescence() {
  const args = Array.from(arguments);
  const db = args[0];
  const orchestratorId = args[1];
  const initialWorkerIds = args[2];
  const options = args[3];
  const state = {
    db: db,
    orchestratorId: orchestratorId,
    initialIds: new Set(initialWorkerIds),
    timeoutMs: resolveTimeoutMs(options),
    pollMs: resolvePollMs(options),
    ignoreRound: resolveIgnoreRound(options),
    startTime: Date.now(),
    missingChecks: new Map()
  };
  state.deadline = state.startTime + state.timeoutMs;
  let stablePasses = 0;
  while (Date.now() < state.deadline) {
    if (readCancelFlag(options)) throw cancelledError(orchestratorId);
    const observation = await pollOnce(state);
    if (isQuiescent(observation)) {
      stablePasses = stablePasses + 1;
      if (stablePasses >= 2) return observation.agents;
    } else {
      stablePasses = 0;
    }
    await sleepMs(state.pollMs);
  }
  throw timeoutError(orchestratorId);
}

module.exports = { waitForAutonomousWorkerQuiescence };
