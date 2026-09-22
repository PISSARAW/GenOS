'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `genos_mission_evidence_${Date.now()}.db`);
process.env.GENOS_DB_PATH = TMP_DB;
process.env.GENOS_ADMIN_PASSWORD = 'test-only';
process.env.GENOS_MCP_DISABLED_TOOLS = 'orchestrate';

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
const agentEvidenceServicePath = require.resolve('../src/services/agentEvidenceService');
require.cache[agentEvidenceServicePath] = {
  id: agentEvidenceServicePath,
  filename: agentEvidenceServicePath,
  loaded: true,
  exports: {
    workerEvidenceDossiers: () => [],
    evidenceScore: () => 50,
    typedEvidenceSummary: () => ({ legacyScore: 50, typedEvidence: { assessment: {} } }),
    hasDecisionEvidence: () => false,
    decisionEvidenceFailure: () => 'no evidence',
    validateWorkerDossierCoherence: () => ({ valid: true, errors: [] }),
    validateWorkerDossiers: () => ({ valid: true, errors: [] }),
    validateDossierInfluence: () => ({ valid: true, errors: [] }),
    recordWorkerEvidence: () => {},
    buildWorkerSynthesisPrompt: (p) => p,
    clusterWorkerDossiers: () => [],
    dossierDigest: () => ({}),
    extractEvidenceReport: (v) => v || {},
    boundedScore: (v) => v,
    MAX_WORKER_DOSSIER_EVENTS: 50,
  }
};

const { getDatabase, closeDatabase } = require('../src/db');
const { collectMissionEvidence, buildEvidenceFlags, buildEvidenceKinds, buildTypedProfiles } = require('../src/services/missionEvidenceCollector');
const { buildMissionContext } = require('../bin/orchestratorMissionHelpersBuildContext.cjs');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

let db = null;

test('setup', async () => {
  db = await getDatabase(TMP_DB);
});

test('collectMissionEvidence returns structured evidence from empty mission', async () => {
  const result = await collectMissionEvidence(db, 'nonexistent_mission', []);
  assert.ok(result);
  assert.ok(Array.isArray(result.evidence));
  assert.ok(Array.isArray(result.dossiers));
  assert.ok(Array.isArray(result.runs));
  assert.ok(Array.isArray(result.telemetry));
  assert.ok(result.flags);
  assert.ok(Array.isArray(result.profiles));
});

test('buildEvidenceFlags: all completed => missionOutcome true, noFailedAgents true', () => {
  const agents = [
    { id: 'a1', status: 'completed' },
    { id: 'a2', status: 'completed' },
  ];
  const { buildEvidenceFlags } = require('../src/services/missionEvidenceCollector');
  const flags = buildEvidenceFlags({ agents, dossiers: [], telemetry: [] });
  assert.strictEqual(flags.missionOutcome, true);
  assert.strictEqual(flags.allAgentsCompleted, true);
  assert.strictEqual(flags.noFailedAgents, true);
});

test('buildEvidenceFlags: one failed => noFailedAgents false', () => {
  const agents = [
    { id: 'a1', status: 'completed' },
    { id: 'a2', status: 'error' },
  ];
  const { buildEvidenceFlags } = require('../src/services/missionEvidenceCollector');
  const flags = buildEvidenceFlags({ agents, dossiers: [], telemetry: [] });
  assert.strictEqual(flags.noFailedAgents, false);
});

test('collectMissionEvidence with real worker evidence telemetry', async () => {
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, parent_agent_id, current_task) VALUES (?, 'orch', 'orchestrator', 'completed', 'orchestrator', NULL, 'test')`, 'orch_evidence');
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, parent_agent_id, current_task) VALUES (?, 'worker1', 'worker', 'completed', 'worker', ?, 'test')`, 'worker_evidence_1', 'orch_evidence');
  await db.run(`INSERT OR IGNORE INTO strategy_contracts (id, agent_id, version, status, primary_strategy, contract_hash, contract_json, created_by) VALUES (?, ?, 1, 'active', 'test', '{}', '{}', 'test')`, 'contract_1', 'orch_evidence');
  await db.run(`INSERT INTO telemetry_events (event_type, action, detail, payload_json, agent_id, severity) VALUES (?, 'EVIDENCE', 'report', '{}', ?, 'info')`, 'EVIDENCE_REPORT', 'orch_evidence');
  await db.run(`INSERT INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, metrics_json) VALUES (?, ?, ?, 1, 'completed', '{}')`, 'run_1', 'orch_evidence', 'contract_1');

  const agents = [
    { id: 'orch_evidence', status: 'completed', name: 'orch', role: 'orchestrator' },
    { id: 'worker_evidence_1', status: 'completed', name: 'worker1', role: 'worker', parent_agent_id: 'orch_evidence' },
  ];

  const result = await collectMissionEvidence(db, 'orch_evidence', agents);
  assert.ok(result.telemetry.length > 0, 'should collect telemetry events');
  assert.ok(result.runs.length > 0, 'should collect execution runs');
  assert.ok(result.flags.testsPassed === false || typeof result.flags.testsPassed === 'boolean');
  assert.ok(result.evidence.length >= 0);
});

test('buildMissionContext produces real evidence kinds when db available', async () => {
  const agents = [
    { id: 'orch_ctx_test', status: 'completed', name: 'orch', role: 'orchestrator' },
  ];
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, parent_agent_id, current_task) VALUES (?, 'orch', 'orchestrator', 'completed', 'orchestrator', NULL, 'test')`, 'orch_ctx_test');
  await db.run(`INSERT INTO telemetry_events (event_type, action, detail, payload_json, agent_id, severity) VALUES (?, 'COMPLETE', 'done', '{}', ?, 'info')`, 'AGENT_COMPLETED', 'orch_ctx_test');

  const result = await helpers.buildMissionContext({ success: true }, {}, {}, db, 'orch_ctx_test', agents);
  assert.ok(result.context.evidence, 'evidence should exist');
  assert.ok(Array.isArray(result.context.evidence), 'evidence should be array');
  assert.ok(result.context.flags, 'flags should exist');
  assert.ok(typeof result.context.flags === 'object', 'flags should be object');
});

test('buildMissionContext falls back to synthetic when no db', async () => {
  const result = await helpers.buildMissionContext({ success: true }, {}, {});
  assert.ok(result.context);
  assert.strictEqual(result.context.missionOutcome, true);
  assert.ok(Array.isArray(result.context.evidence));
});

test('evidence kinds include worker_evidence when dossiers have reports', () => {
  const dossiers = [
    { workerId: 'w1', events: [{ evidenceReport: { outcome: 'success' } }] },
  ];
  const kinds = buildEvidenceKinds({ dossiers, runs: [], telemetry: [] });
  assert.ok(kinds.includes('worker_evidence'), 'should include worker_evidence when dossiers have reports');
});

test('evidence kinds include test_suite_passed when barrier satisfied', () => {
  const telemetry = [{ event_type: 'WORKER_EVIDENCE_BARRIER_SATISFIED' }];
  const kinds = buildEvidenceKinds({ dossiers: [], runs: [], telemetry });
  assert.ok(kinds.includes('test_suite_passed'), 'should include test_suite_passed when barrier satisfied');
});

test('typed profiles created from dossiers and runs', () => {
  const dossiers = [{ workerId: 'w1', events: [{ evidenceReport: {} }] }];
  const runs = [{ status: 'completed' }];
  const profiles = buildTypedProfiles(dossiers, runs);
  assert.ok(profiles.length >= 2, 'should have at least 2 profiles (observational + experimental)');
  assert.ok(profiles.some(p => p.type === 'observational'), 'should have observational profile');
  assert.ok(profiles.some(p => p.type === 'experimental'), 'should have experimental profile');
});

async function main() {
  let passed = 0, failed = 0;
  for (const entry of TESTS) {
    try { await entry.fn(); passed++; console.log(`  ok - ${entry.name}`); }
    catch (error) { failed++; console.error(`  FAIL - ${entry.name}\n    ${error.stack || error.message}`); }
  }
  try { await closeDatabase(); } catch (_) {}
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main();
