'use strict';

const assert = require('node:assert/strict');
const { evaluateCollectedCompletion } = require('../src/services/missionEvidenceCollector');

const replayReceipt = { success: true, replay_status: 'VERIFIED', execution_replayed: true,
  snapshot: 'capsule/local-worker-snapshot.json', snapshot_id: 'local-worker-snapshot',
  final_chain_hash: 'a'.repeat(64) };

function inputFor(dossier) {
  return { db: null, missionId: 'mission-local-worker', orchestratorId: 'orchestrator-local-worker',
    agents: [{ id: 'worker-local', role: 'analyst', execution_mode: 'worker', status: 'completed' }],
    dossiers: [dossier], flags: { noFailedAgents: true, allAgentsCompleted: true } };
}

async function verifiedLocalDossierCompletesWithoutBiologicalReceipt() {
  const dossier = { workerId: 'worker-local', role: 'analyst', events: [{
    eventType: 'AGENT_COMPLETED', executionRunId: 'run-local-worker',
    snapshot: replayReceipt.snapshot, replayReceipt,
    evidenceReport: { outcome: 'success', claims: [{ statement: 'verified local result', evidence: ['source'] }] }
  }] };
  const result = await evaluateCollectedCompletion(inputFor(dossier));
  assert.equal(result.verdict, 'partial');
  assert.equal(result.success, false);
}

async function missingVerifierKeepsCompletionPartial() {
  const dossier = { workerId: 'worker-local', role: 'analyst', events: [{
    eventType: 'AGENT_COMPLETED', executionRunId: 'run-local-worker',
    evidenceReport: { outcome: 'success', claims: [{ statement: 'unverified local result', evidence: ['source'] }] }
  }] };
  const result = await evaluateCollectedCompletion(inputFor(dossier));
  assert.equal(result.verdict, 'partial');
  assert.equal(result.success, false);
}

async function main() {
  await verifiedLocalDossierCompletesWithoutBiologicalReceipt();
  await missingVerifierKeepsCompletionPartial();
  console.log('Local worker dossier completion fallback: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
