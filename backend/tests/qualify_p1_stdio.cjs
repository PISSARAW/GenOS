'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { peer, initialize } = require('./helpers/stdioRpcPeer.cjs');

const root = path.resolve(__dirname, '../..');
const tool = 'genos_search_failures';
const scope = { organizationId: 'p1-stdio-org', projectId: 'p1-stdio-project', limit: 50 };
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function environment(directory) {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return { ...env, NODE_ENV: 'test', GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(directory, 'state.db'), GENOS_STUDIO_ROOT: path.join(directory, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(directory, 'capsules'), GENOS_WORKSPACES_ROOT: directory,
    GENOS_WORKSPACE_ROOT: root, GENOS_REPO_ROOT: root, GENOS_AGOW_MODE: 'off',
    GENOS_ADMIN_PASSWORD: 'p1-stdio-isolated-test-only', GENOS_MCP_TOOL_TIMEOUT_MS: '30000' };
}

async function fixture(env) {
  for (const [name, value] of Object.entries(env)) if (name.startsWith('GENOS_') || name === 'NODE_ENV') process.env[name] = value;
  const store = require('../src/db');
  const db = await store.getDatabase();
  const rows = [['own', scope.organizationId, scope.projectId], ['sibling', scope.organizationId, 'p1-stdio-other'],
    ['foreign', 'p1-stdio-foreign', scope.projectId], ['global', null, null], ['ambiguous', null, 'p1-stdio-other']];
  for (const [id, organization, project] of rows) {
    await db.run(`INSERT INTO genome_decisions (id, title, content, category, created_by, organization_id, project_id)
      VALUES (?, ?, ?, 'Failure', 'p1-stdio-fixture', ?, ?)`, [`p1-stdio-${id}`, id, `canary-${id}`, organization, project]);
  }
  await store.closeDatabase();
}

function failures(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.success, true);
  assert.ok(Array.isArray(parsed.failures), 'MCP must return the domain result, without another transport envelope.');
  return parsed.failures.map(item => item.id).filter(id => id.startsWith('p1-stdio-')).sort();
}

async function withPeer(options, action, receipts) {
  const client = peer(options);
  try { await initialize(client); return await action(client); }
  finally {
    await client.close();
    receipts.push({ command: options.command, pid: client.pid, lease: options.env.GENOS_MCP_LEASE || null,
      transcript: client.transcript, invalidStdout: client.invalidStdout, stderr: client.stderr });
  }
}

async function scoped(client) {
  assert.deepEqual((await client.request('tools/list')).tools.map(item => item.name), [tool]);
  const call = args => client.request('tools/call', { name: tool, arguments: args });
  assert.deepEqual(failures(await call(scope)), ['p1-stdio-own']);
  assert.deepEqual(failures(await call({ ...scope, includeGlobal: true })), ['p1-stdio-global', 'p1-stdio-own']);
  assert.deepEqual(failures(await call({ ...scope, projectId: 'missing' })), []);
  const tooMany = await call({ ...scope, limit: 100 });
  assert.equal(tooMany.isError, true);
  assert.ok(JSON.stringify(tooMany).includes('limit'));
  const incomplete = await call({ projectId: scope.projectId });
  assert.equal(incomplete.isError, true);
  assert.ok(JSON.stringify(incomplete).includes('FAILURE_MEMORY_SCOPE_INCOMPLETE'));
  const diagnosis = await client.request('tools/call', { name: 'genos_diagnose', arguments: {} });
  assert.equal(diagnosis.isError, true);
  assert.ok(JSON.stringify(diagnosis).includes('lease'));
}

async function lifecycle(client) {
  const call = args => client.request('tools/call', { name: tool, arguments: args });
  assert.deepEqual(failures(await call(scope)), ['p1-stdio-own']);
  await revokeMemory(call);
}

async function revokeMemory(call) {
  const store = require('../src/db');
  const db = await store.getDatabase();
  try {
    await db.run("UPDATE genome_decisions SET category='Fact' WHERE id='p1-stdio-own'");
    assert.deepEqual(failures(await call(scope)), []);
  } finally {
    await db.run("UPDATE genome_decisions SET category='Failure' WHERE id='p1-stdio-own'");
    await store.closeDatabase();
  }
  assert.deepEqual(failures(await call(scope)), ['p1-stdio-own']);
}

async function denied(client) {
  assert.deepEqual((await client.request('tools/list')).tools, []);
  const refusal = await client.request('tools/call', { name: tool, arguments: scope });
  assert.equal(refusal.isError, true);
  assert.ok(!JSON.stringify(refusal).includes('canary-'));
}

async function malformed(client) {
  let refusal;
  try { refusal = await client.request('tools/call', { name: tool, arguments: null }); }
  catch (_) {
    const response = client.transcript.at(-1);
    assert.equal(response.direction, 'response');
    refusal = response.message;
    assert.equal(typeof refusal.error?.code, 'number');
  }
  assert.ok(refusal.isError === true || refusal.error);
  assert.ok(!JSON.stringify(refusal).includes('canary-'));
}

async function expire(client, expiresAt) {
  assert.deepEqual((await client.request('tools/list')).tools.map(item => item.name), [tool]);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now()) + 10));
  await denied(client);
}

async function qualify(options, receipts) {
  await withPeer({ ...options, env: { ...options.env, GENOS_MCP_LEASE: tool } }, scoped, receipts);
  await withPeer({ ...options, env: { ...options.env, GENOS_MCP_LEASE: tool } }, lifecycle, receipts);
  await withPeer({ ...options, env: { ...options.env, GENOS_MCP_LEASE: tool } }, malformed, receipts);
  for (const policy of [{}, { GENOS_MCP_LEASE: tool, GENOS_MCP_DISABLED_TOOLS: tool },
    { GENOS_MCP_LEASE: tool, GENOS_MCP_LEASE_EXPIRES_AT: '0' }]) {
    await withPeer({ ...options, env: { ...options.env, ...policy } }, denied, receipts);
  }
  const expiresAt = Date.now() + 7500;
  await withPeer({ ...options, env: { ...options.env, GENOS_MCP_LEASE: tool,
    GENOS_MCP_LEASE_EXPIRES_AT: String(expiresAt) } }, client => expire(client, expiresAt), receipts);
}

async function main() {
  const binary = process.env.GENOS_P1_RUST_MCP;
  assert.ok(binary && fs.existsSync(binary), 'GENOS_P1_RUST_MCP must name the current built Rust MCP executable.');
  const binaryHash = hash(binary);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-p1-stdio-'));
  const env = environment(directory);
  const receipts = [];
  try {
    await fixture(env);
    await qualify({ command: process.execPath, args: [path.join(root, 'mcp/index.js')], cwd: root, env }, receipts);
    await qualify({ command: binary, cwd: root, env }, receipts);
    assert.equal(hash(binary), binaryHash);
    assert.ok(receipts.every(receipt => receipt.invalidStdout.length === 0), 'stdio stdout must contain only JSON-RPC.');
    console.log('Live Node/Rust stdio: scoped domain reads, explicit globals, missing scope, disabled and expiring leases passed.');
  } finally {
    const output = process.env.P1_STDIO_EVIDENCE_DIR;
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, 'stdio-receipts.json'), JSON.stringify({ binaryHash, receipts,
        authenticatedIdentity: false, completeConsumerParity: false, modelCalls: 0 }, null, 2));
    }
    await require('../src/db').closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
