'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const { encodeMission } = require('../src/services/runtimeProtocol');

const executable = path.resolve(__dirname, '../bin/caller-mcp-runtime.cjs');
const scope = { id: 'execution-run:caller', costUsd: 1, tokens: 4000,
  organizationId: 'org', projectId: 'project' };

async function database(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode = WAL; ${TABLES_MODEL_ATTEMPTS}`);
  await db.run('INSERT INTO mission_model_budget_scopes VALUES (?, ?, ?, ?, ?, ?, ?)',
    scope.id, 'caller', 'parent', 'org', 'project', 1, 4000);
  return db;
}

function runCaller(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable], { env: { ...process.env,
      GENOS_DB_PATH: input.filename, GENOS_MCP_SAMPLING_URL: input.url,
      GENOS_MCP_SAMPLING_TOKEN: 'local-test' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
    child.stdin.end(encodeMission(input.mission));
  });
}

async function samplingServer() {
  let calls = 0;
  const server = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ result: { content: [{ type: 'text',
      text: '{"outcome":"failed"}' }], usage: {
      inputTokens: 1, outputTokens: 1, costUsd: 0.2 } } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/sample`,
    calls: () => calls };
}

function mission(value = scope) {
  return { agentId: 'child', orchestratorAgentId: 'parent',
    executionMode: 'worker', prompt: 'Réponds avec le rapport demandé.',
    executionBudgetJson: JSON.stringify({ costUsd: 1, tokens: 4000 }),
    modelBudgetScopeJson: JSON.stringify(value) };
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-caller-budget-'));
  const filename = path.join(directory, 'budget.sqlite');
  let db;
  let sample;
  try {
    db = await database(filename);
    sample = await samplingServer();
    const first = await runCaller({ filename, url: sample.url, mission: mission() });
    assert.equal(sample.calls(), 1, first.stderr);
    const rows = await db.all('SELECT status, actual_cost_usd, actual_tokens FROM model_budget_reservations');
    assert.deepEqual(rows, [{ status: 'settled', actual_cost_usd: 0.2, actual_tokens: 2 }]);
    const forged = await runCaller({ filename, url: sample.url,
      mission: mission({ ...scope, tokens: 40000 }) });
    assert.equal(sample.calls(), 1);
    assert.match(forged.stderr, /MISSION_MODEL_BUDGET_SCOPE_INVALID|does not match/);
    console.log('Caller MCP runtime shared budget checks passed.');
  } finally {
    if (sample) await new Promise((resolve) => sample.server.close(resolve));
    if (db) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
