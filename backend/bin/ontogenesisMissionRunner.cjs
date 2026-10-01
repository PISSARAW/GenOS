'use strict';

const fs = require('fs');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const helpers = require('./orchestratorMissionHelpers.cjs');
const { updateExecution } = require('../src/services/ontogenesis/executionStore');
const { waitForMission, completionGate } = require('../src/services/ontogenesis/missionCompletion');

async function main() {
  const operationId = process.argv[3];
  if (process.argv[2] !== '--operation' || !/^[a-z0-9_-]+$/i.test(operationId)) throw new Error('operation-invalide');
  const request = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  if (request.id !== operationId) throw new Error('operation-incoherente');
  const db = await getDatabase();
  const row = await db.get("SELECT * FROM ontogenesis_execution WHERE id = ? AND phase = 'prepared'", [operationId]);
  if (!row) throw new Error('execution-non-preparee');
  const claimed = await db.run("UPDATE ontogenesis_execution SET phase = 'running', pid = ?, executable = ?, updated_at = datetime('now') WHERE id = ? AND phase = 'prepared'", [process.pid, __filename, row.id]);
  if (claimed.changes !== 1) throw new Error('execution-deja-reconciliee');
  await runMission(db, request);
}

async function runMission(db, request) {
  let stopping = false;
  const stop = () => { stopping = true; runtime.stopMission(request.id).catch(() => {}); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const prepared = await helpers.prepareMission({ db, enhancedPrompt: request.mission, id: request.id,
      request, policyRequest: request, nceMetadata: {} });
    if (stopping) throw new Error('execution-arretee');
    await helpers.startOrchestratorMission({ db, ...prepared, id: request.id, enhancedPrompt: request.mission,
      request, policyRequest: request, allowedCommands: request.allowed_commands, allowFileEdits: true, runtime });
    const agents = await waitForMission(db, request, { stopped: () => stopping });
    const gate = await completionGate(db, request, agents);
    const telemetry = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'ORCHESTRATOR_WORKSPACE_CREATED' ORDER BY rowid DESC LIMIT 1", [request.id]);
    const candidateWorktree = telemetry ? JSON.parse(telemetry.payload_json).workspaceRoot : null;
    const success = !stopping && gate.allowed === true;
    await updateExecution(db, { id: request.id, phase: 'finished', result: { success, candidateWorktree, completionGate: gate } });
  } catch (error) {
    await runtime.stopMission(request.id);
    await updateExecution(db, { id: request.id, phase: 'finished', result: { success: false, error: error.message } });
  } finally {
    await closeDatabase();
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
