import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-orchestrator-proof-'));
const missionId = `proof-${process.pid}-${Date.now()}`;
const orchestratorId = `proof-agent-${process.pid}`;
const executionRunId = `proof-run-${process.pid}`;
const agent = 'agents/securite/snapshot_integrity_guardian.agent.json';
const snapshotPath = path.join(root, '.genos-agent-worlds', 'orchestrator-preflight',
  `${requireSafeSegment(missionId)}.snapshot.json`);

process.env.GENOS_DB_PATH = path.join(temporary, 'proof.db');
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_DB_BOOTSTRAP_SKIP = '0';
process.env.GENOS_BIN = path.join(root, 'target', 'debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
process.env.NODE_ENV = 'test';

const database = require('../backend/src/db');
const db = await database.getDatabase();
const preflightTools = require('../backend/bin/orchestratorMcpPreflight.cjs');
const hypotheses = [
  { id: 'state-recovery', statement: 'Restart recovery drops messages above the acknowledged checkpoint.' },
  { id: 'attempt-counter', statement: 'A delivery attempt counter prevents retry after restart.' },
  { id: 'queue-order', statement: 'Queue reconstruction changes pending message order.' }
];

try {
  const preflight = await preflightTools.runOrchestratorMcpPreflight({
    db, orchestratorId, missionId, task: 'Check post-restart message recovery.',
    repoRoot: root, workspaceRoot: root, snapshotAgent: agent,
    tools: ['genos_search_failures', 'genos_diagnose', 'genos_snapshot'], hypotheses
  });
  assert.deepEqual(preflight.observedTools.sort(), ['genos_diagnose', 'genos_search_failures', 'genos_snapshot']);
  assert(fs.existsSync(snapshotPath), 'the native pre-mutation snapshot must exist');

  const workerPayload = {
    executionRunId,
    proposal: { tests: [{ command: 'node checks/verify.js', exitCode: 0 }] },
    evidenceReport: { tests: [{ command: 'node checks/verify.js', exitCode: 0 }] },
    nativeOracleRef: 'oracle://independent-check/verified'
  };
  await db.run(`INSERT INTO telemetry_events
    (event_id, session_id, agent_id, event_type, action, detail, payload_json, severity)
    VALUES (?, ?, ?, 'AGENT_COMPLETED', 'LOCAL_CODE_PROPOSAL', ?, ?, 'info')`,
  `${executionRunId}-event`, 'proof-session', orchestratorId,
  'Terminal local worker evidence fixture for the MCP phase integration probe.', JSON.stringify(workerPayload));

  const postflight = await preflightTools.runOrchestratorMcpPostflight({
    db, orchestratorId, missionId, task: 'Check post-restart message recovery.',
    repoRoot: root, workspaceRoot: root, preflight,
    localResult: { executionRun: { id: executionRunId } }, workerElapsedMs: 17
  });
  assert.deepEqual(postflight.observedTools.sort(), [
    'genos_evaluate_trajectories', 'genos_hypothesis_evidence', 'genos_record_decision', 'genos_replay'
  ]);

  const journal = await db.all(`SELECT tool_name, status FROM primitive_execution_journal
    WHERE orchestrator_id = ? AND stage_key IN (?, ?) ORDER BY tool_name`,
  orchestratorId, `preflight:${missionId}`, `postflight:${missionId}`);
  assert.deepEqual(journal.map(row => [row.tool_name, row.status]).sort(), [
    ['genos_diagnose', 'completed'], ['genos_evaluate_trajectories', 'completed'],
    ['genos_hypothesis_evidence', 'completed'], ['genos_record_decision', 'completed'],
    ['genos_replay', 'completed'], ['genos_search_failures', 'completed'], ['genos_snapshot', 'completed']
  ]);
  const decision = await db.get('SELECT id, content FROM genome_decisions WHERE created_by = ? ORDER BY created_at DESC LIMIT 1', orchestratorId);
  assert(decision, 'the non-promoting decision must persist');
  assert.match(JSON.parse(decision.content).decision, /Accept the local worker result/);
  assert(JSON.parse(decision.content).evidence.length >= 4);
  console.log('Real MCP preflight, evidence, trajectory evaluation, native replay and non-promoting decision all completed with durable receipts.');
} finally {
  await database.closeDatabase();
  if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
  try { fs.rmdirSync(path.dirname(snapshotPath)); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
  await fs.promises.rm(temporary, { recursive: true, force: true });
}

function requireSafeSegment(value) {
  return require('node:crypto').createHash('sha256').update(String(value || 'mission')).digest('hex').slice(0, 24);
}
