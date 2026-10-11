'use strict';

const fs = require('node:fs');
const path = require('node:path');

const INPUT = 'perception-state.txt';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function prepare(context) {
  fs.writeFileSync(path.join(context.worker.workspaceRoot, INPUT), 'state-a');
}

async function readState(db, runId, agentId) {
  if (runId) {
    const row = await db.get("SELECT payload_json FROM adaptive_state WHERE scope = 'continuous_execution' AND key = ?", runId);
    return row ? JSON.parse(row.payload_json) : null;
  }
  const rows = await db.all("SELECT payload_json FROM adaptive_state WHERE scope = 'continuous_execution'");
  return rows.map((row) => JSON.parse(row.payload_json)).find((state) => state.agentId === agentId) || null;
}

async function waitFor(db, runId, probe) {
  const deadline = Date.now() + probe.timeoutMs;
  do {
    const state = await readState(db, runId, probe.agentId);
    if (state && probe.condition(state)) return state;
    await delay(50);
  } while (Date.now() < deadline);
  return readState(db, runId, probe.agentId);
}

async function waitForRebased(db, agentId) {
  const deadline = Date.now() + 90000;
  do {
    const row = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'LOCAL_GENERATION_REBASED' ORDER BY id DESC LIMIT 1", agentId);
    if (row) return JSON.parse(row.payload_json);
    await delay(100);
  } while (Date.now() < deadline);
  return null;
}

async function run(context, execution) {
  const runId = execution?.executionRun?.id;
  const agentId = context.worker.agentId;
  const initial = await waitFor(context.db, runId, { agentId, condition: () => true, timeoutMs: 60000 });
  if (!initial) return { observerAvailable: false, observedCount: 0, planRevision: 0,
    reason: execution?.deterministic ? 'native_worker_has_no_continuous_observer' : 'observer_not_started' };
  const observedRunId = initial.runId;
  const file = path.join(context.worker.workspaceRoot, INPUT);
  fs.writeFileSync(file, 'state-b');
  await waitFor(context.db, observedRunId, { condition: (state) => state.observations.length >= 1, timeoutMs: 3000 });
  fs.writeFileSync(file, 'state-c');
  const state = await waitFor(context.db, observedRunId, { condition: (current) => current.observations.length >= 2, timeoutMs: 3000 });
  const rows = await context.db.all("SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'PERCEPTION_OBSERVED' ORDER BY id", context.worker.agentId);
  const rebased = process.env.GENOS_PERCEPTION_REACTIVE === '1'
    ? await waitForRebased(context.db, agentId) : null;
  return observationSummary({ state, rows, runId: observedRunId, rebased });
}

function observationSummary({ state, rows, runId, rebased }) {
  return { observerAvailable: true, observedCount: state?.observations.length || 0,
    planRevision: state?.planRevision || 0, invalidated: state?.invalidated === true,
    telemetryCount: rows.length, distinctDigests: new Set((state?.observations || []).map((item) => item.digest)).size,
    runBound: (state?.observations || []).every((item) => item.runId === runId),
    ...(process.env.GENOS_PERCEPTION_REACTIVE === '1' ? { rebased: rebased?.payload || rebased } : {}),
    reason: (state?.observations.length || 0) >= 2 ? null : 'two_changes_not_observed_during_mission' };
}

async function settle(workerId) {
  const runtime = require('../src/services/agentRuntimeAdapter');
  const { activeProcesses } = require('../src/services/agentOrchestrationState');
  if (activeProcesses.has(workerId)) await runtime.stopMission(workerId, { single: true });
  const deadline = Date.now() + 5000;
  while (activeProcesses.has(workerId) && Date.now() < deadline) await delay(50);
  await delay(400);
  return !activeProcesses.has(workerId);
}

module.exports = { INPUT, prepare, run, settle };
