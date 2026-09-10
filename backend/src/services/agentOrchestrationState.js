/**
 * Shared orchestration state and the telemetry/database bridge every agent
 * runtime module speaks through. Keeping the maps in one leaf module lets the
 * feature services (evidence, rounds, recovery, fleet) coordinate without
 * importing the adapter itself.
 */
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const leasePolicy = require('./toolLeasePolicy');

const activeProcesses = new Map();
const missionStarts = new Map();
const cancelledStarts = new Set();
const pendingContinuations = new Map();
const autonomousRounds = new Map();
const pendingWorkerRecoveries = new Map();
const workerEvidenceRounds = new Map();
const activeWorkerRecoveryDispatches = new Set();
const activeWorkerBarriers = new Map();

// Terminal = no further transition is possible. `idle` is the initial and
// re-arm state (workers are INSERTed as idle, recovery re-arms to idle) and
// `blocked` is a budget/guard halt that recovery or release can leave, so
// neither is terminal. Readers (worker quiescence barrier, chaos eligibility)
// observe this set live and now wait for / consider those states correctly.
const TERMINAL_AGENT_STATUSES = new Set(['completed', 'error', 'terminated', 'apoptosis', 'quarantined']);
const WORKER_EVIDENCE_EVENTS = new Set([
  'EVIDENCE_REPORT', 'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED',
  'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN',
  'APOPTOSIS_TRIGGERED', 'CELLULAR_APOPTOSIS'
]);

// Resolves the two calling conventions used across the codebase:
//   emit(id, type, action, detail, payload, severity?, status?)
//   emit(id, type, action, detail, { payload, severity, status })
// The first is the common form (and previously lost both payload and
// severity because they were passed as extra positional arguments).
function resolveEmitArgs(optionsOrPayload = {}, severityArg, statusArg) {
  const isOptionsStyle = optionsOrPayload !== null
    && typeof optionsOrPayload === 'object'
    && Object.prototype.hasOwnProperty.call(optionsOrPayload, 'payload');
  if (isOptionsStyle) {
    return {
      payload: optionsOrPayload.payload || {},
      severity: severityArg || optionsOrPayload.severity || 'info',
      status: statusArg !== undefined ? statusArg : optionsOrPayload.status
    };
  }
  return {
    payload: optionsOrPayload || {},
    severity: severityArg || 'info',
    status: statusArg
  };
}

function emit(..._args) {
  const [agentId, eventType, action, detail, optionsOrPayload = {}, severityArg, statusArg] = _args;
  const { payload, severity, status } = resolveEmitArgs(optionsOrPayload, severityArg, statusArg);
  const sessionId = payload.sessionId || payload.executionRunId || payload.runId || `agent-session-${agentId}`;
  return telemetry.emitEvent({ eventType, agentId, action, detail, payload: { ...payload, sessionId }, sessionId, severity, status });
}

function workerToolLease(role) {
  return leasePolicy.workerLeaseForRole(role);
}

function orchestratorToolLease(plan, knownTools) {
  return leasePolicy.orchestratorLeaseForPlan(plan || {}, knownTools);
}

async function updateAgent(agentId, status, currentTask) {
  const db = await getDatabase();
  await db.run(
    'UPDATE agents SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    status || null, currentTask || null, agentId
  );
  if (status) {
    await db.run(
      'UPDATE trinity_worlds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?',
      status, agentId
    );
  }
}

module.exports = {
  activeProcesses,
  missionStarts,
  cancelledStarts,
  pendingContinuations,
  autonomousRounds,
  pendingWorkerRecoveries,
  workerEvidenceRounds,
  activeWorkerRecoveryDispatches,
  activeWorkerBarriers,
  TERMINAL_AGENT_STATUSES,
  WORKER_EVIDENCE_EVENTS,
  emit,
  updateAgent,
  workerToolLease,
  orchestratorToolLease
};
