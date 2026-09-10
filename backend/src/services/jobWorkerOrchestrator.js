const telemetry = require('./telemetryObserver');
const { getDatabase } = require('../db');
const { state } = require('./jobWorkerState');
const { selectFairWorkflow } = require('./jobWorkerScheduling');
const { claim } = require('./jobWorkerClaim');
const { withRetry } = require('./jobWorkerRetry');
const { executeWorkflow } = require('./jobWorkerWorkflow');
const { executeEvaluation, updateCampaignStatus } = require('./jobWorkerEvaluation');
const { executeModelJob } = require('./jobWorkerModel');
const { recoverInterruptedJobs } = require('./jobWorkerRecovery');
const vectorMemory = require('./vectorMemoryService');

const QUEUE_TABLES = ['workflow_runs', 'evaluation_jobs', 'model_jobs'];

function trackExecution(promise) {
  const execution = promise.finally(() => state.inFlightJobs.delete(execution));
  state.inFlightJobs.add(execution);
  return execution;
}

async function processWorkflowTable(db) {
  const rows = await db.all("SELECT r.*, w.organization_id, w.project_id FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.status = 'queued' ORDER BY r.priority DESC, r.created_at ASC");
  const job = selectFairWorkflow(rows, 'workflow_runs');
  if (!job) return;
  const outcome = await claim(db, 'workflow_runs', job.id);
  if (!outcome.claimed) return;
  const owned = { ...job, claim_token: outcome.token };
  await withRetry(db, 'workflow_runs', owned, () => executeWorkflow(db, owned));
}

async function runEvaluationJob(db, job) {
  if (job.campaign_id) await db.run("UPDATE evaluation_campaigns SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'planned'", job.campaign_id);
  await withRetry(db, 'evaluation_jobs', job, () => executeEvaluation(db, job));
  await updateCampaignStatus(db, job.campaign_id);
}

async function processQueuedTable(db, table) {
  const rows = await db.all(`SELECT * FROM ${table} WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP) ORDER BY priority DESC, created_at ASC`);
  const job = selectFairWorkflow(rows, table);
  if (!job) return;
  const outcome = await claim(db, table, job.id);
  if (!outcome.claimed) return;
  const owned = { ...job, claim_token: outcome.token };
  if (table === 'evaluation_jobs') {
    await runEvaluationJob(db, owned);
    return;
  }
  await withRetry(db, table, owned, () => executeModelJob(db, owned));
}

async function processTable(db, table) {
  if (state.busyTables.has(table)) return;
  state.busyTables.add(table);
  try {
    if (table === 'workflow_runs') {
      await processWorkflowTable(db);
      return;
    }
    await processQueuedTable(db, table);
  } finally { state.busyTables.delete(table); }
}

async function maybeRecover(db) {
  if (state.recovered && Date.now() - state.lastRecoveryAt < 60000) return;
  await recoverInterruptedJobs(db);
  state.recovered = true;
  state.lastRecoveryAt = Date.now();
}

async function processOnce() {
  if (state.busy) return;
  state.busy = true;
  try {
    const db = await getDatabase();
    await maybeRecover(db);
    const executions = QUEUE_TABLES.map((table) => trackExecution(processTable(db, table)));
    await Promise.all(executions);
  } finally { state.busy = false; }
}

function startJobWorker(intervalMs = 250) {
  if (state.timer) return state.timer;
  state.timer = setInterval(() => processOnce().catch((error) => telemetry.emitEvent({ eventType: 'JOB_WORKER_TICK_FAILED', agentId: 'system', action: 'JOB_WORKER', detail: error.message, severity: 'error', payload: { code: error.code || null } })), intervalMs);
  state.timer.unref?.();
  const sleepInterval = Math.max(60_000, Number(process.env.GENOS_MEMORY_SLEEP_INTERVAL_MS) || 60 * 60 * 1000);
  state.memoryTimer = setInterval(() => runMemoryConsolidationOnce().catch(() => {}), sleepInterval);
  state.memoryTimer.unref?.();
  return state.timer;
}

async function stopJobWorker({ drain = true, timeoutMs = 30000 } = {}) {
  if (state.timer) clearInterval(state.timer);
  if (state.memoryTimer) clearInterval(state.memoryTimer);
  state.timer = null;
  state.memoryTimer = null;
  if (!drain) return;
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  while (state.inFlightJobs.size > 0 && Date.now() < deadline) {
    await Promise.race([
      ...Array.from(state.inFlightJobs).map((p) => Promise.resolve(p).catch(() => {})),
      new Promise((resolve) => setTimeout(resolve, 50))
    ]);
  }
}

async function runMemoryConsolidationOnce() {
  if (state.memoryCycleRunning) return { success: false, skipped: true, reason: 'cycle_in_progress' };
  state.memoryCycleRunning = true;
  try {
    const db = await getDatabase();
    const result = await vectorMemory.sleepCycle(db);
    telemetry.emitEvent({ eventType: 'MEMORY_SLEEP_CYCLE_COMPLETED', agentId: 'memory_consolidator', action: 'CONSOLIDATE', detail: 'Automatic memory sleep cycle completed.', payload: result });
    return result;
  } finally { state.memoryCycleRunning = false; }
}

function getWorkerStatus() {
  return {
    running: Boolean(state.timer),
    busy: state.busy,
    processId: process.pid
  };
}

module.exports = {
  startJobWorker,
  stopJobWorker,
  runMemoryConsolidationOnce,
  processOnce,
  getWorkerStatus
};
