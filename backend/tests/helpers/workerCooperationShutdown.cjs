'use strict';

async function closeRuns(db, rootId) {
  const rows = await db.all(`SELECT id,agent_id FROM strategy_execution_runs WHERE status IN ('planned','running')
    AND (agent_id=? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id=?))`, rootId, rootId);
  for (const row of rows) {
    await require('../../src/services/strategyExecutionService').recordExecutionEvent(db, row.agent_id, {
      id: `cooperation-shutdown:${row.id}`, eventType: 'AGENT_HALTED', timestamp: new Date().toISOString(),
      detail: 'Qualification driver stopped; no controller completion or promotion is asserted.',
      payload: { executionRunId: row.id, reason: 'qualification_shutdown' } });
  }
}

async function stop(db, rootId) {
  const state = require('../../src/services/agentOrchestrationState');
  const barrier = state.activeWorkerBarriers.get(rootId) || { workerIds: new Set() };
  barrier.cancelled = true;
  state.activeWorkerBarriers.set(rootId, barrier);
  state.cancelledStarts.add(rootId);
  const rows = await db.all('SELECT id FROM agents WHERE parent_agent_id=?', rootId);
  const ids = new Set([rootId, ...rows.map(row => row.id), ...barrier.workerIds]);
  for (const id of ids) state.cancelledStarts.add(id);
  const queue = require('../../src/services/agentRecovery/durableRecoveryQueue');
  for (const id of ids) await queue.cancel(id);
  for (const id of ids) await require('../../src/services/agentRecovery/queueWorkerRecovery').waitForRecoveryWrites(id);
  await require('../../src/services/agentRecovery/recoveryDispatchLifecycle').wait(ids);
  // A dispatch may have created an identity before observing the cancelled barrier.
  const finalRows = await db.all('SELECT id FROM agents WHERE parent_agent_id=?', rootId);
  for (const row of finalRows) ids.add(row.id);
  for (const id of ids) await require('../../src/services/agentRuntimeAdapter').stopMission(id, { single: true });
  await require('../../src/services/garageRuntimeService').stop(db);
  await require('./flushTelemetrySideEffects').flushTelemetrySideEffects();
  for (const id of ids) await queue.cancel(id);
  await require('../../src/services/agentRecovery/recoveryDispatchLifecycle').wait(ids);
  await require('../../src/services/agentRecovery/recoveryDispatchLifecycle').settle([
    require('../../src/services/runtimeMissionTasks').drain()]);
  for (const id of ids) state.cancelledStarts.add(id);
  await closeRuns(db, rootId);
  return { stopped: true, workerIds: [...ids] };
}

module.exports = { stop };
