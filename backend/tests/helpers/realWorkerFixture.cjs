'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-real-worker-'));
  const workspace = path.join(root, 'source');
  await fs.mkdir(workspace);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(workspace, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  Object.assign(process.env, environment(root, workspace));
  const db = await require('../../src/db').getDatabase(process.env.GENOS_DB_PATH);
  await db.run("INSERT INTO organizations(id,name) VALUES('proof-org','Proof')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES('proof-project','proof-org','Proof')");
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES('proof-ws','Proof',?,'proof-org','proof-project')", workspace);
  await require('../../src/services/garageRuntimeService').stop(db);
  return { root, workspace, db };
}

function environment(root, workspace) {
  return { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', GENOS_DB_BOOTSTRAP_SKIP: '0',
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
    GENOS_DB_PATH: path.join(root, 'proof.sqlite'), GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'), GENOS_WORKSPACES_ROOT: root,
    GENOS_WORKSPACE_ROOT: workspace, GENOS_DISABLE_WORKSPACE_GC: '1',
    GENOS_GVX_LEDGER_HMAC_SECRET: 'real-worker-regression-ledger-only',
    GENOS_EPISTEMIC_RECEIPT_SECRET: 'real-worker-regression-oracle-only' };
}

async function dispatch(value, options = {}) {
  const payload = { action: 'dispatch_worker', orchestratorId: 'mcp_orchestrator_real_test',
    mission: 'Compute the assigned, source-bound result.',
    workspaceId: 'proof-ws', workspaceRoot: value.workspace, role: 'implementation',
    executor: 'local', localModel: 'ollama://qwen2.5-coder:7b',
    execution_budget: { tokens: 16000, costUsd: 1, latencyMs: 60000 },
    workerTokenLimit: 6000, timeoutMs: 60000, readOnlyWorkspaceEvidence: true,
    ...options.payload };
  const file = path.join(value.root, 'request.json');
  const receipt = path.join(value.root, 'interruption.json');
  await fs.writeFile(file, JSON.stringify(payload));
  const child = await execute([options.mode || 'complete', file, receipt]);
  await fs.writeFile(path.join(value.root, 'child.log'), child.stdout + '\n' + child.stderr);
  const interruption = options.mode === 'crash' ? await fs.readFile(receipt, 'utf8').catch(() => null) : null;
  return { ...child, interruption: interruption ? JSON.parse(interruption) : null };
}

function execute(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'realWorkerProbe.cjs'), ...args],
      { env: { ...process.env, GENOS_DB_BOOTSTRAP_SKIP: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

async function close(value) {
  await require('../../src/services/garageRuntimeService').stop(value.db);
  await require('./flushTelemetrySideEffects').flushTelemetrySideEffects();
  await require('../../src/db').closeDatabase();
  if (path.dirname(value.root) !== path.resolve(os.tmpdir())) throw new Error('Unexpected fixture cleanup path');
  await fs.rm(value.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

module.exports = { fixture, dispatch, close };
