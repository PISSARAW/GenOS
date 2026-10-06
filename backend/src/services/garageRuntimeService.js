'use strict';

const store = require('./garageQueueStore');
const processControl = require('./garageProcessControl');
const { error } = require('./garageRequests');
const schedulers = new WeakMap();

async function assertLease(db, mission) {
  if (!mission.garageRequestId) return;
  const row = await db.get(`SELECT * FROM garage_queue WHERE request_id = ? AND worker_id = ?
    AND lease_id = ? AND status = 'running' AND phase = 'ready'
    AND julianday(lease_expires_at) > julianday('now')`, mission.garageRequestId, mission.agentId, mission.garageLeaseId);
  if (!row) throw error('GARAGE_STALE_LEASE', 'Garage claim is no longer executable.');
}

async function bindExecution(ctx) {
  const mission = ctx.normalizedMission;
  if (!mission.garageRequestId) return;
  await assertLease(ctx.db, mission);
  const row = await ctx.db.get('SELECT request_json FROM garage_queue WHERE request_id = ?', mission.garageRequestId);
  const persisted = { ...JSON.parse(row.request_json), ...runtimeFields(mission) };
  const result = await ctx.db.run(`UPDATE garage_queue SET result_json = ?, request_json = ?
    WHERE request_id = ? AND lease_id = ? AND status = 'running' AND phase = 'ready'`,
    JSON.stringify({ runId: ctx.executionRun.id }), JSON.stringify(persisted), mission.garageRequestId, mission.garageLeaseId);
  if (!result.changes) throw error('GARAGE_STALE_LEASE', 'Claim was revoked before execution binding.');
}

function runtimeFields(mission) {
  const keys = ['workerKind','workerContract','methodContract','workerAssignment','workspaceRoot',
    'workspaceProvisioned','executionBudget','executionPolicy','toolLease','executor','localRuntime'];
  return Object.fromEntries(keys.filter((key) => mission[key] !== undefined).map((key) => [key, mission[key]]));
}

async function settle(input, row, receipt) {
  const expired = !(Date.parse(row.lease_expires_at) > Date.now()) || Date.parse(row.deadline_at) <= Date.now();
  const changed = await store.updatePersistent(input.db, { requestId: row.request_id, leaseId: row.lease_id,
    status: expired ? 'expired' : receipt ? 'completed' : 'failed', evidence: receipt, result: receipt,
    error: expired ? 'runtime_lease_expired' : receipt ? null : 'runtime_terminal_without_verified_evidence' });
  if (changed) await require('./workerGarageService').enterIdleState(input.db, row.worker_id, row.orchestrator_id);
}

async function reconcileOne(input, requestId) {
  const row = await input.db.get(`SELECT * FROM garage_queue WHERE request_id = ? AND status = 'running'`, requestId);
  if (!row || !['ready','awaiting_approval'].includes(row.phase)) return;
  if (await (input.isAlive || processControl.isAlive)(input.db, row.worker_id)) {
    await reconcileLive(input, row);
    return;
  }
  return reconcileTerminal(input, row);
}

async function reconcileTerminal(input, row) {
  const worker = await input.db.get('SELECT status FROM agents WHERE id = ?', row.worker_id);
  const verified = await require('./garageRuntimeEvidence').receipt(input.db, row);
  if (!verified && await pendingApproval(input.db, row)) return;
  await clearApprovalPhase(input.db, row);
  if (verified) return settle(input, row, verified);
  if (worker?.status === 'completed' && Date.now() - Date.parse(row.updated_at.replace(' ', 'T') + 'Z') < 10000) return;
  if (worker?.status === 'running' && Date.parse(row.lease_expires_at) > Date.now()) return;
  await settle(input, row, null);
}

async function pendingApproval(db, row) {
  if (Date.parse(row.deadline_at) <= Date.now()) return false;
  const binding = JSON.parse(row.result_json || '{}');
  if (!binding.runId) return false;
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', binding.runId);
  if (run?.status !== 'awaiting_approval') return false;
  await db.run("UPDATE garage_queue SET phase = 'awaiting_approval' WHERE request_id = ? AND lease_id = ?", row.request_id, row.lease_id);
  await store.renewPersistent(db, { requestId: row.request_id, leaseId: row.lease_id });
  return true;
}

async function reconcileLive(input, row) {
  const leaseExpired = !(Date.parse(row.lease_expires_at) > Date.now());
  const deadlineExpired = Date.parse(row.deadline_at) <= Date.now();
  if (!leaseExpired && !deadlineExpired) {
    await store.renewPersistent(input.db, { requestId: row.request_id, leaseId: row.lease_id });
    return;
  }
  await (input.stopVerified || processControl.stopVerified)({ ...input, workerId: row.worker_id });
  await store.updatePersistent(input.db, { requestId: row.request_id, leaseId: row.lease_id,
    status: 'expired', error: deadlineExpired ? 'runtime_deadline_expired' : 'runtime_lease_expired' });
  await require('./workerGarageService').enterIdleState(input.db, row.worker_id, row.orchestrator_id);
}

async function tick(input) {
  await require('./garageSchedulingService').recoverInterrupted(input);
  await store.expirePersistent(input.db);
  const rows = await input.db.all("SELECT request_id FROM garage_queue WHERE status = 'running' AND phase IN ('ready','awaiting_approval')");
  for (const row of rows) {
    try { await reconcileOne(input, row.request_id); }
    catch (failure) { console.error('[GarageFabric] Reconciliation blocked:', failure.message); }
  }
  await input.db.run(`UPDATE garage_queue SET status = 'expired', error_text = 'queue_deadline_expired'
    WHERE status = 'queued' AND deadline_at IS NOT NULL AND julianday(deadline_at) <= julianday('now')`);
  const dispatched = await require('./garageQueueDispatcher').drainOne(input);
  if (!dispatched?.started) await require('./garageSchedulingService').resumeWaiting(input);
  return dispatched;
}

function start(input) {
  if (schedulers.has(input.db)) return schedulers.get(input.db);
  let pending = null;
  let stopped = false;
  const run = () => {
    if (pending || stopped) return pending;
    pending = tick(input).catch((failure) => console.error('[GarageFabric] Tick failed:', failure.message))
      .finally(() => { pending = null; });
    return pending;
  };
  const timer = setInterval(run, Math.max(100, input.intervalMs || 1000));
  timer.unref();
  const handle = { tick: run, stop: async () => { stopped = true; clearInterval(timer); await pending; schedulers.delete(input.db); } };
  schedulers.set(input.db, handle);
  run();
  return handle;
}

async function stop(db) { await schedulers.get(db)?.stop(); }

async function finalizeAgent(agentId) {
  const db = await require('../db').getDatabase();
  await require('./telemetryObserver').flush(1000);
  const rows = await db.all("SELECT request_id FROM garage_queue WHERE worker_id = ? AND status = 'running'", agentId);
  for (const row of rows) await reconcileOne({ db }, row.request_id);
}

module.exports = { assertLease, bindExecution, reconcileOne, tick, start, stop, finalizeAgent };
async function clearApprovalPhase(db, row) {
  if (row.phase !== 'awaiting_approval') return;
  await db.run("UPDATE garage_queue SET phase = 'ready' WHERE request_id = ? AND lease_id = ?", row.request_id, row.lease_id);
  row.phase = 'ready';
}
