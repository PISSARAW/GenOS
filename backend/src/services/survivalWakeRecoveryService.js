'use strict';

const { withTransaction } = require('../db');
const conditions = require('./survivalWakeService');
const survival = require('./survivalStateService');
const missions = require('./missionIdentityService');
const { processMatches, terminatePid } = require('./processTermination');

async function reconcileAbandoned(db) {
  for (const condition of await conditions.abandoned(db)) {
    await reconcileOne(db, condition);
  }
}

async function reconcileOne(db, condition) {
  const state = await survival.get(db, condition.agentId);
  if (!state || !['dormant', 'waking'].includes(state.state)) return;
  if (state.wakeConditionId !== condition.id || state.snapshotId !== condition.snapshotId) return;
  const snapshot = await db.get('SELECT status FROM cryptobiosis_snapshots WHERE snapshot_id = ?', condition.snapshotId);
  if (!['frozen', 'thawed'].includes(snapshot?.status)) return;
  const context = await loadContext(db, condition);
  if (await finalizeRunning(db, { condition, state, snapshot, context })) return;
  if (await unresolvedLiveRuntime(db, { condition, state, context })) return;
  await restoreDormancy(db, { condition, state, snapshot, context });
}

async function loadContext(db, condition) {
  const runtime = await db.get('SELECT status, runtime_pid, runtime_executable FROM agents WHERE id = ?', condition.agentId);
  const mission = condition.missionId ? await missions.get(db, condition.missionId) : null;
  const authorityTable = condition.missionId ? await db.get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mission_execution_authority'"
  ) : null;
  const authority = authorityTable ? await db.get(
    'SELECT agent_id, state, owner_pid FROM mission_execution_authority WHERE mission_id = ?', condition.missionId
  ) : null;
  return { runtime, mission, authority };
}

async function finalizeRunning(db, input) {
  const { condition, state, context } = input;
  if (state.state !== 'waking' || context.mission?.status !== 'active'
    || context.mission.orchestratorAgentId !== condition.agentId
    || context.authority?.state !== 'running' || context.authority.agent_id !== condition.agentId
    || (!runtimeVerified(context.runtime) && context.runtime?.status !== 'completed')) return false;
  await withTransaction(db, async () => {
    await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP WHERE snapshot_id = ? AND status = 'frozen'", condition.snapshotId);
    await survival.observe(db, condition.agentId, {
      energy: 1, forcedState: 'recovered', snapshotId: condition.snapshotId, wakeConditionId: condition.id
    });
  });
  return true;
}

async function unresolvedLiveRuntime(db, input) {
  const { condition, context } = input;
  const pid = context.runtime?.runtime_pid;
  if (!pidAlive(pid)) return false;
  if (!runtimeVerified(context.runtime)) return true;
  if (!canStopUnconfirmed(context, condition.agentId)) return true;
  if (!terminatePid(pid, context.runtime.runtime_executable)) return true;
  if (pidAlive(pid)) return true;
  await db.run(`UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL,
    runtime_executable = NULL, status = 'terminated', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND runtime_pid = ?`, condition.agentId, pid);
  return false;
}

function canStopUnconfirmed(context, agentId) {
  if (!context.mission || !context.authority) return false;
  if (!['active', 'dormant'].includes(context.mission.status)) return false;
  if (context.mission.orchestratorAgentId !== agentId || context.authority.agent_id !== agentId) return false;
  if (context.mission.status === 'active' && context.authority.state === 'running') return false;
  return !pidAlive(context.authority.owner_pid);
}

function runtimeVerified(runtime) {
  return pidAlive(runtime?.runtime_pid)
    && processMatches(runtime.runtime_pid, runtime.runtime_executable, true);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function restoreDormancy(db, input) {
  const { condition, state, snapshot, context } = input;
  if (context.mission && !['active', 'dormant'].includes(context.mission.status)) return;
  if (context.mission?.status === 'active' && context.authority?.state === 'running') return;
  await withTransaction(db, async () => {
    if (snapshot.status === 'thawed') await db.run(
      "UPDATE cryptobiosis_snapshots SET status = 'frozen', thawed_at = NULL WHERE snapshot_id = ?", condition.snapshotId
    );
    if (state.state === 'waking') await survival.observe(db, condition.agentId, {
      forcedState: 'dormant', snapshotId: condition.snapshotId, wakeConditionId: condition.id
    });
    if (context.mission?.status === 'active') await missions.setStatus(db, condition.missionId, 'dormant');
    await conditions.rearm({ db, id: condition.id });
  });
}

async function retryAmbiguous(db, input) {
  if (!input?.missionId || !input?.actor || typeof input.evidenceRef !== 'string' || !input.evidenceRef.trim()) {
    throw Object.assign(new Error('Mission, actor and evidenceRef are required.'), { code: 'WAKE_RETRY_INVALID', status: 400 });
  }
  return withTransaction(db, async () => {
    const mission = await missions.get(db, input.missionId);
    const state = mission?.orchestratorAgentId ? await survival.get(db, mission.orchestratorAgentId) : null;
    const condition = state?.wakeConditionId ? await conditions.get({ db, id: state.wakeConditionId }) : null;
    const context = condition ? await loadContext(db, condition) : null;
    const snapshot = state?.snapshotId ? await db.get(
      'SELECT status FROM cryptobiosis_snapshots WHERE snapshot_id = ?', state.snapshotId
    ) : null;
    assertRetryable({ mission, state, condition, context, snapshot });
    await db.run("UPDATE cryptobiosis_snapshots SET status = 'frozen', thawed_at = NULL WHERE snapshot_id = ?", state.snapshotId);
    await db.run(`UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL,
      runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, mission.orchestratorAgentId);
    await survival.observe(db, mission.orchestratorAgentId, {
      forcedState: 'dormant', snapshotId: state.snapshotId, wakeConditionId: condition.id,
      source: 'operator_wake_retry', evidenceRef: input.evidenceRef
    });
    await missions.setStatus(db, input.missionId, 'dormant');
    await conditions.rearm({ db, id: condition.id });
    await recordRetryAudit(db, { ...input, agentId: mission.orchestratorAgentId });
    return { success: true, missionId: input.missionId, wakeConditionId: condition.id, status: 'dormant' };
  });
}

function assertRetryable(input) {
  if (retryStateMatches(input) && retryProcessesStopped(input)) return;
  throw Object.assign(new Error('An abandoned ambiguous wake with no live runtime is required.'), {
    code: 'WAKE_RETRY_CONFLICT', status: 409
  });
}

function retryStateMatches(input) {
  const { mission, state, condition, context, snapshot } = input;
  return mission?.status === 'active' && state?.state === 'waking'
    && condition?.missionId === mission.missionId && condition.status === 'triggered'
    && condition.agentId === mission.orchestratorAgentId
    && condition.snapshotId === state.snapshotId && context.authority?.state === 'running'
    && context.authority.agent_id === mission.orchestratorAgentId
    && ['frozen', 'thawed'].includes(snapshot?.status);
}

function retryProcessesStopped(input) {
  return !pidAlive(input.condition.ownerPid) && !pidAlive(input.context.authority.owner_pid)
    && !pidAlive(input.context.runtime?.runtime_pid);
}

async function recordRetryAudit(db, input) {
  await db.run(`INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason)
    VALUES (?, ?, 'MISSION_WAKE_RETRY', ?, 'authorized', ?)`, input.actor,
  input.agentId, input.missionId, input.evidenceRef);
}

module.exports = { reconcileAbandoned, retryAmbiguous };
