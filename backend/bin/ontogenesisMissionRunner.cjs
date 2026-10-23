'use strict';

const fs = require('fs');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const helpers = require('./orchestratorMissionHelpers.cjs');
const { updateExecution } = require('../src/services/ontogenesis/executionStore');
const { waitForMission, completionGate, candidateWorkspace, candidateWorkspaces, selectVerifiedCandidate } = require('../src/services/ontogenesis/missionCompletion');

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
    await require('./orchestratorMissionInitialization.cjs').initializeMission({
      db, action: 'orchestrate', orchestratorId: request.id, task: request.mission, request
    });
    const prepared = await helpers.prepareMission({ db, enhancedPrompt: request.mission, id: request.id,
      request, policyRequest: request, nceMetadata: {} });
    await require('../src/services/missionIdentityService').create(db, {
      missionId: request.missionId, objective: request.mission, orchestratorAgentId: request.id
    });
    if (stopping) throw new Error('execution-arretee');
    await helpers.startOrchestratorMission({ db, ...prepared, id: request.id, enhancedPrompt: request.mission,
      missionId: request.missionId, request, policyRequest: request, allowedCommands: request.allowed_commands,
      allowFileEdits: request.allow_file_edits === true, runtime });
    const agents = await waitForMission(db, request, { stopped: () => stopping });
    const receiptService = require('../src/services/ontogenesis/missionVerifierReceiptService');
    let candidateWorktree = candidateWorkspace(agents, request.id);
    let verifierReceipt = null;
    if (request.requiresEvidenceBeforePromotion !== false) {
      const selected = await selectVerifiedCandidate({ candidates: candidateWorkspaces(agents, request.id),
        missionId: request.id, checks: request.verifierChecks, allowExecution: request.allowVerifierExecution,
        timeoutMs: request.verifierTimeoutMs, createReceipt: receiptService.createReceipt,
        validateReceipt: receiptService.validateReceipt });
      candidateWorktree = selected.candidateWorktree;
      verifierReceipt = selected.verifierReceipt;
    }
    const gate = await completionGate(db, { request, agents, verifierReceipt, candidateWorktree });
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
