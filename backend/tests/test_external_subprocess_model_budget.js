'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const { encodeMission } = require('../src/services/runtimeProtocol');

const fixture = path.resolve(__dirname, 'fixtures/externalSubprocessBudget.cjs');
const scope = { id: 'execution-run:external', costUsd: 1, tokens: 16,
  organizationId: 'org', projectId: 'project' };

async function database(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode = WAL; ${TABLES_MODEL_ATTEMPTS}`);
  await db.run(`INSERT INTO mission_model_budget_scopes VALUES
    (?, ?, ?, ?, ?, ?, ?)`, scope.id, 'external', 'parent', 'org', 'project', 1, 16);
  return db;
}

function mission(value = scope) {
  return { agentId: 'child', orchestratorAgentId: 'parent',
    executionBudgetJson: JSON.stringify({ costUsd: 1, tokens: 16 }),
    modelBudgetScopeJson: value === undefined ? '' : JSON.stringify(value) };
}

function runChild(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture], { env: { ...process.env,
      GENOS_DB_PATH: input.filename, GENOS_TEST_START_AT: String(input.startAt || 0),
      GENOS_TEST_USAGE: input.usage || '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Child exited ${code}: ${stderr}`));
      else { try { resolve(JSON.parse(stdout)); } catch (_) { reject(new Error(stdout || stderr)); } }
    });
    child.stdin.end(encodeMission(input.mission));
  });
}

async function concurrent(db, filename) {
  const startAt = Date.now() + 450;
  const outcomes = await Promise.all([
    runChild({ filename, startAt, mission: mission() }),
    runChild({ filename, startAt, mission: { ...mission(), agentId: 'child-2' } })
  ]);
  assert.equal(outcomes.filter((item) => item.ok).length, 1);
  assert.equal(outcomes.reduce((sum, item) => sum + item.providerCalls, 0), 1);
  assert.equal(outcomes.find((item) => !item.ok).code, 'MODEL_COST_BUDGET_EXCEEDED');
  assert.equal((await db.all('SELECT * FROM model_budget_reservations')).length, 1);
}

async function failures(db, filename) {
  const bad = [mission({ ...scope, tokens: 160 }),
    { ...mission(), orchestratorAgentId: 'forged' },
    { ...mission(), executionBudgetJson: '{}' }];
  for (const item of bad) {
    const result = await runChild({ filename, mission: item });
    assert.equal(result.providerCalls, 0);
    assert.equal(result.code, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
  }
  const missingDb = await runChild({ filename: `${filename}.missing`, mission: mission() });
  assert.equal(missingDb.providerCalls, 0);
  assert.equal(missingDb.code, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
  const noUsage = await runChild({ filename, mission: {
    ...mission(), executionBudgetJson: JSON.stringify({ costUsd: 0.4, tokens: 16 })
  }, usage: 'missing' });
  assert.equal(noUsage.providerCalls, 1);
  assert.equal(noUsage.code, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
  const rows = await db.all('SELECT status FROM model_budget_reservations');
  assert.equal(rows.filter((row) => row.status === 'uncertain').length, 1);
}

async function legacy() {
  const result = await runChild({ filename: '', mission: {
    ...mission(), modelBudgetScopeJson: '' } });
  assert.equal(result.ok, true);
  assert.equal(result.providerCalls, 1);
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-external-budget-'));
  const filename = path.join(directory, 'budget.sqlite');
  let db;
  try {
    db = await database(filename);
    await concurrent(db, filename);
    await failures(db, filename);
    await legacy();
    console.log('External subprocess model budget checks passed.');
  } finally {
    if (db) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
