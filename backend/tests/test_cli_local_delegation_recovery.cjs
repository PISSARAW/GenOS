'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sqlite3 = require('sqlite3');
const repository = path.resolve(__dirname, '../..');

function fixture(root) {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'sales.csv'), 'sale\n10\n\n20\n');
  fs.writeFileSync(path.join(workspace, 'parser.py'), 'def parse(lines):\n    return [int(line.strip() or 0) for line in lines]\n');
  fs.writeFileSync(path.join(workspace, 'test_parser.py'), "from parser import parse\ndef test_missing():\n    assert parse(['10','','20']) == [10,20]\n");
  return { action: 'dispatch_worker', workspaceRoot: workspace,
    mission: 'Delegate the supplied CSV mini-project within the authorized child budget: inspect sales.csv, fix parser.py to exclude missing values instead of treating them as zero, then have a distinct child verify the diff and pytest. Preserve real child identities, dependencies, outputs, tests and receipts. No automatic promotion.',
    role: 'sub_orchestrator', workerKind: 'sub_orchestrator', executor: 'local', localModel: 'ollama://qwen2.5-coder:7b',
    readOnlyWorkspaceEvidence: true, localContextTokens: 16384, workerTokenLimit: 12000,
    execution_budget: { tokens: 40000, costUsd: 1 }, timeoutMs: 300000,
    allowFileEdits: true, allowedWritePaths: ['parser.py'], allowedCommands: ['pytest'] };
}

function environment(root, fault) {
  const env = { ...process.env, GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_DB_PATH: path.join(root, 'test.sqlite'), GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_WORKSPACE_ROOT: path.join(root, 'workspace'),
    GENOS_GVX_LEDGER_HMAC_SECRET: 'cli-delegation-recovery-secret-at-least32',
    GENOS_TEST_DELEGATION_CALLS: path.join(root, 'calls.json'), GENOS_TEST_DROP_DELEGATION_RUN: fault ? '1' : '0' };
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_EXECUTION_MODE', 'GENOS_MISSION_ID', 'GENOS_WORKSPACES_ROOT']) delete env[key];
  return env;
}

async function rows(filename, sql) {
  const db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY);
  try { return await new Promise((resolve, reject) => db.all(sql, (error, value) => error ? reject(error) : resolve(value))); }
  finally { await new Promise(resolve => db.close(resolve)); }
}

async function scenario(fault) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cli-delegation-recovery-'));
  const request = fixture(root);
  const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'fixtures/delegationRecoveryProvider.cjs'),
    'backend/bin/genos-orchestrate.cjs', JSON.stringify(request)], {
    cwd: repository, env: environment(root, fault), encoding: 'utf8', timeout: 240000, windowsHide: true });
  fs.writeFileSync(path.join(root, 'output.log'), `${result.stdout}\n${result.stderr}`);
  const runs = await rows(path.join(root, 'test.sqlite'), 'SELECT id,agent_id,status,guardrail_reason FROM strategy_execution_runs ORDER BY rowid');
  const calls = JSON.parse(fs.readFileSync(path.join(root, 'calls.json'), 'utf8'));
  const subId = calls.find(call => call.phase === 'plan').agentId;
  const parentRuns = runs.filter(run => run.agent_id === subId);
  assert.equal(parentRuns.length, 2, `${root}: ${JSON.stringify(runs)}\n${result.stderr}`);
  if (fault) {
    const failures = await rows(path.join(root, 'test.sqlite'), "SELECT detail FROM telemetry_events WHERE event_type='AGENT_FAILED'");
    assert.ok(failures.some(row => row.detail.includes('EXECUTION_AUTHORITY_RUN_REQUIRED')), root);
  } else {
    assert.equal(result.status, 0, `${root}: ${result.stderr}`);
    assert.equal(parentRuns.at(-1).status, 'completed', `${root}: ${JSON.stringify(runs)}`);
    const ledger = await rows(path.join(root, 'test.sqlite'), "SELECT payload_json FROM gvx_development_events WHERE id LIKE 'gvx-delegation:%'");
    const bindings = ledger.map(row => JSON.parse(row.payload_json).binding);
    assert.deepEqual(bindings.map(binding => binding.parentRunId), [parentRuns[0].id, parentRuns[1].id, parentRuns[1].id]);
    const tests = await rows(path.join(root, 'test.sqlite'), 'SELECT agent_id,execution_run_id FROM local_code_test_execution_receipts ORDER BY rowid');
    assert.equal(tests.length, 2); assert.notEqual(tests[0].execution_run_id, tests[1].execution_run_id);
    assert.equal(calls.filter(call => call.phase === 'plan').length, 2);
    assert.equal(calls.filter(call => call.phase === 'synthesis').length, 2);
    assert.equal(fs.readFileSync(path.join(request.workspaceRoot, 'parser.py'), 'utf8'), 'def parse(lines):\n    return [int(line.strip() or 0) for line in lines]\n');
  }
  console.log(`CLI delegation recovery ${fault ? 'missing-run fault reproduced' : 'current-run delivery passed'}: ${root}`);
}
(async () => { await scenario(true); await scenario(false); })().catch(error => { console.error(error); process.exitCode = 1; });
