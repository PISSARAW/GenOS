'use strict';

const assert = require('node:assert/strict');

function track(context, workerId) {
  const state = require('../../src/services/agentOrchestrationState');
  const barrier = state.activeWorkerBarriers.get(context.id) || { workerIds: new Set(), cancelled: false };
  assert.equal(barrier.cancelled, false);
  barrier.workerIds.add(workerId);
  state.activeWorkerBarriers.set(context.id, barrier);
}

async function settle(context, stage) {
  const remaining = Date.parse(context.control.ctx.protocolBinding.expiresAt) - Date.now();
  assert.ok(remaining > 0, 'Parent authority expired while reconciling workers.');
  await require('../../src/services/agentFleetService').waitForAutonomousWorkerQuiescence(
    context.db, context.id, [stage.workerId], { timeoutMs: remaining, ignoreRoundPending: true });
  stage.quiescent = true;
  const events = await context.db.all(`SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='WORKER_RECOVERY_DISPATCHED' ORDER BY rowid`, context.id);
  const ids = new Set([stage.workerId]);
  stage.recoveryTransitions = [];
  for (const row of events) {
    const event = JSON.parse(row.payload_json);
    if (!ids.has(event.sourceWorkerId)) continue;
    ids.add(event.workerId);
    stage.recoveryTransitions.push(event);
  }
  const store = require('../../src/services/biologicalWorkerStore');
  for (const id of [...ids].reverse()) {
    const row = await context.db.get(`SELECT r.id,w.path FROM strategy_execution_runs r JOIN agents a ON a.id=r.agent_id
      JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=? AND a.parent_agent_id=? AND r.status='completed'
      ORDER BY r.rowid DESC LIMIT 1`, id, context.id);
    if (!row) continue;
    const binding = await store.binding(context.db, row.id);
    assert.equal(binding?.genome.workerContract.identity.workerKind, stage.kind);
    assert.equal(binding?.missionId, context.id);
    if (id !== stage.workerId) {
      stage.originalWorkerId = stage.workerId;
      stage.workerId = id;
      stage.workspaceRoot = row.path;
    }
    break;
  }
}

module.exports = { track, settle };
