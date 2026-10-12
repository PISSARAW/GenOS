'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const { encodeMission, decodeEvents } = require('../src/services/runtimeProtocol');

const runtime = path.resolve(__dirname, '../bin/genos-agent-runtime.cjs');
const scope = { id: 'execution-run:codex-parent', costUsd: 0.25,
  tokens: 100, organizationId: 'org', projectId: 'project' };

async function database(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode = WAL; ${TABLES_MODEL_ATTEMPTS}`);
  await db.run(`INSERT INTO mission_model_budget_scopes
    (scope_id, parent_run_id, parent_agent_id, organization_id, project_id,
     cost_ceiling_usd, token_ceiling) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  scope.id, 'codex-parent', 'parent', 'org', 'project', 0.25, 100);
  return db;
}

function mission(agentId, override = {}) {
  return { agentId, orchestratorAgentId: 'parent', executionMode: 'worker',
    prompt: 'Return a short answer.', modelBudgetScopeJson: JSON.stringify(scope),
    executionBudgetJson: JSON.stringify({ costUsd: 0.25, tokens: 100 }),
    toolLeaseJson: '[]', ...override };
}

function decode(buffer) {
  const result = [];
  const remainder = decodeEvents(buffer, (event) => result.push(event));
  assert.equal(remainder.length, 0);
  return result;
}

function runChild(input, filename, executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runtime], { env: { ...process.env,
      GENOS_DB_PATH: filename, CODEX_EXECUTABLE: executable },
    stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code,
      events: decode(Buffer.concat(stdout)), stderr }));
    child.stdin.end(encodeMission(input));
  });
}

function assertRefusal(result, code) {
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventType, 'AGENT_HALTED');
  assert.equal(result.events[0].action, 'MODEL_BUDGET_GUARD');
  const payload = JSON.parse(result.events[0].payloadJson);
  assert.equal(payload.code, code);
  assert.equal(payload.usage, undefined);
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-codex-budget-'));
  const filename = path.join(directory, 'budget.sqlite');
  const providerMarker = path.join(directory, 'provider-was-started');
  let db;
  try {
    db = await database(filename);
    const children = await Promise.all(['child-a', 'child-b'].map((id) =>
      runChild(mission(id), filename, providerMarker)));
    for (const child of children) {
      assertRefusal(child, 'CODEX_CLI_SHARED_BUDGET_UNSUPPORTED');
    }
    assert.equal(fs.existsSync(providerMarker), false);
    assert.equal((await db.all('SELECT id FROM model_budget_reservations')).length, 0);
    const forged = await runChild(mission('forged', { orchestratorAgentId: 'other' }),
      filename, providerMarker);
    assertRefusal(forged, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
    const missing = await runChild(mission('missing'), `${filename}.missing`, providerMarker);
    assertRefusal(missing, 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
    console.log('Codex CLI shared budget guard checks passed.');
  } finally {
    if (db) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
