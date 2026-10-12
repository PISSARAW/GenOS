'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const { encodeMission, decodeMissionInput } = require('../src/services/runtimeProtocol');
const envelope = require('../src/services/agentMissionEnvelopeService');

const fixture = path.resolve(__dirname, 'fixtures/subprocessBudgetRoute.cjs');

async function database(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode = WAL; ${TABLES_MODEL_ATTEMPTS}
    CREATE TABLE provider_configs (provider TEXT, model TEXT, endpoint TEXT,
      capabilities_json TEXT, cost_input REAL, cost_output REAL,
      latency_ms INTEGER, enabled INTEGER);
    CREATE TABLE usage_ledger (id TEXT PRIMARY KEY, organization_id TEXT,
      project_id TEXT, release_id TEXT, category TEXT, quantity REAL,
      cost_usd REAL, metadata_json TEXT);`);
  await db.run('INSERT INTO provider_configs VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'openai', 'model', 'https://api.example.test/v1', '[]', 1, 1, 0, 1);
  await db.run(`INSERT INTO mission_model_budget_scopes VALUES
    ('execution-run:parent-run', 'parent-run', 'parent', 'org', 'project', 0.000002, 2)`);
  return db;
}

function mission(scope) {
  return { agentId: 'child', orchestratorAgentId: 'parent',
    executionMode: 'worker', executionBudgetJson: JSON.stringify({ costUsd: 0.000002, tokens: 2 }),
    modelBudgetScopeJson: scope === undefined ? '' : JSON.stringify(scope) };
}

function runChild(input, filename, startAt = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture], { env: { ...process.env,
      GENOS_DB_PATH: filename, GENOS_TEST_START_AT: String(startAt) },
      stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Child exited ${code}: ${stderr}`));
      else { try { resolve(JSON.parse(stdout)); } catch (_) { reject(new Error(stdout || stderr)); } }
    });
    child.stdin.end(encodeMission(input));
  });
}

async function testConcurrentScope(db, filename, scope) {
  const startAt = Date.now() + 400;
  const outcomes = await Promise.all([
    runChild(mission(scope), filename, startAt),
    runChild({ ...mission(scope), agentId: 'child-2' }, filename, startAt)
  ]);
  assert.equal(outcomes.filter((result) => result.ok).length, 1);
  assert.equal(outcomes.filter((result) => !result.ok).length, 1);
  assert.equal(outcomes.reduce((sum, result) => sum + result.providerCalls, 0), 1);
  assert.equal(outcomes.find((result) => !result.ok).code, 'MODEL_COST_BUDGET_EXCEEDED');
  assert.equal((await db.all('SELECT id FROM model_budget_reservations')).length, 1);
}

async function testInvalidScope(filename, scope) {
  const cases = [mission(), mission({ ...scope, costUsd: 1 }),
    mission({ ...scope, tokens: 200 }),
    { ...mission(scope), orchestratorAgentId: 'forged' },
    { ...mission(scope), executionBudgetJson: '{}' },
    { ...mission(scope), executionBudgetJson: JSON.stringify({ costUsd: 1, tokens: 2 }) }];
  for (const input of cases) {
    const result = await runChild(input, filename);
    assert.equal(result.ok, false);
    assert.equal(result.providerCalls, 0);
    assert.equal(result.code, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
  }
  const missingDb = await runChild(mission(scope), `${filename}.missing`);
  assert.equal(missingDb.providerCalls, 0);
  assert.equal(missingDb.code, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
}

async function testEnvelopeRoundTrip(scope) {
  const built = envelope.build({ normalizedMission: {
    modelBudgetScope: scope, executionBudget: { costUsd: 0.000002, tokens: 2 } },
  workspaceRoot: '.', dispatchedAgent: { execution_mode: 'worker' },
  runtimeBudget: { costUsd: 0.000002, tokens: 2 } },
  { agentId: 'child', orchestratorAgentId: 'parent' }, {});
  const decoded = decodeMissionInput(encodeMission(built));
  assert.deepEqual(JSON.parse(decoded.modelBudgetScopeJson), scope);
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-subprocess-budget-'));
  const filename = path.join(directory, 'budget.sqlite');
  const scope = { id: 'execution-run:parent-run', costUsd: 0.000002,
    tokens: 2, organizationId: 'org', projectId: 'project' };
  let db;
  try {
    db = await database(filename);
    await testEnvelopeRoundTrip(scope);
    await testInvalidScope(filename, scope);
    await testConcurrentScope(db, filename, scope);
    console.log('Subprocess model budget route checks passed.');
  } finally {
    if (db) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
