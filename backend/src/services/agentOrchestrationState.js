/**
 * Shared orchestration state and the telemetry/database bridge every agent
 * runtime module speaks through. Keeping the maps in one leaf module lets the
 * feature services (evidence, rounds, recovery, fleet) coordinate without
 * importing the adapter itself.
 */
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

const activeProcesses = new Map();
const missionStarts = new Map();
const cancelledStarts = new Set();
const pendingContinuations = new Map();
const autonomousRounds = new Map();
const pendingWorkerRecoveries = new Map();
const workerEvidenceRounds = new Map();
const activeWorkerRecoveryDispatches = new Set();
const activeWorkerBarriers = new Map();

const TERMINAL_AGENT_STATUSES = new Set(['idle', 'completed', 'blocked', 'error', 'terminated', 'apoptosis']);
const WORKER_EVIDENCE_EVENTS = new Set([
  'EVIDENCE_REPORT', 'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED',
  'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'
]);

function emit(agentId, eventType, action, detail, payload = {}, severity = 'info', status) {
  return telemetry.emitEvent({ eventType, agentId, action, detail, payload, severity, status });
}

function workerToolLease(role) {
  const lease = ['genos_search_failures', 'genos_diagnose', 'genos_hypothesis_evidence', 'genos_snapshot', 'genos_run', 'genos_diff', 'genos_evaluate_trajectories', 'genos_record_experience', 'genos_replay', 'genos_organization_state', 'genos_worker_publish', 'genos_worker_inbox'];
  if (/reviewer|observer/i.test(role || '')) lease.push('genos_adversarial_review');
  if (/red_team|blue_team/i.test(role || '')) lease.push('genos_security_coevolution');
  return lease;
}

function orchestratorToolLease(plan = {}) {
  const core = [
    'genos_search_failures', 'genos_diagnose', 'genos_hypothesis_evidence',
    'genos_snapshot', 'genos_fork', 'genos_create', 'genos_solve', 'genos_run',
    'genos_diff', 'genos_evaluate_trajectories', 'genos_merge',
    'genos_record_experience', 'genos_record_decision', 'genos_replay',
    'genos_adversarial_review', 'genos_compile_memory',
    'genos_resilience_hypermutation', 'genos_security_coevolution',
    'genos_parasitic_pressure', 'genos_delegate_worker', 'genos_a_team_preview',
    'genos_trinity_launch', 'genos_change_strategy', 'genos_change_organization', 'genos_organization_state',
    'genos_worker_publish', 'genos_worker_inbox', 'genos_report_progress'
  ];
  return [...new Set([...core, ...(plan.requiredTools || [])])]
    .filter((tool) => tool !== 'genos_orchestrate');
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
