import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const executable = path.join(root, 'target/debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
assert.ok(fs.existsSync(executable), 'Build genos-cli before running the native MCP test.');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-capsule-'));
const workspaceTemporary = fs.mkdtempSync(path.join(root, '.genos-mcp-audit-'));

async function connect(studioRoot, repoRoot = root) {
  const client = new Client({ name: 'genos-native-capsule-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
    cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_MCP_LEASE: 'genos_capsule_create,genos_audit,genos_merge,genos_v2_fork,genos_v2_init',
      GENOS_BIN: executable, GENOS_STUDIO_ROOT: studioRoot, GENOS_REPO_ROOT: repoRoot,
      GENOS_DB_PATH: path.join(temporary, 'test.db'),
      NODE_ENV: 'test' } });
  transport.stderr.on('data', () => {});
  await client.connect(transport);
  return client;
}

try {
  const matrix = path.join(temporary, 'matrix');
  const client = await connect(matrix);
  try {
    const created = await client.callTool({ name: 'genos_capsule_create', arguments: { snapshot_id: 'fixture-snapshot' } });
    assert.notEqual(created.isError, true, created.content?.[0]?.text);
    const capsule = JSON.parse(created.content[0].text);
    assert.equal(capsule.success, true);
    assert.equal(capsule.verified, true);
    const capsulePath = path.join(matrix, 'capsules', `${capsule.capsule_id}.json`);
    assert.ok(fs.existsSync(capsulePath), 'capsule must be persisted');
    assert.equal(JSON.parse(fs.readFileSync(capsulePath, 'utf8')).hash, capsule.hash);

    const workspaceAudit = path.join(workspaceTemporary, 'audit.json');
    const relativeAudit = path.relative(root, workspaceAudit).replaceAll('\\', '/');
    const audit = await client.callTool({ name: 'genos_audit', arguments: {
      snapshot_id: capsule.capsule_id, output: relativeAudit } });
    assert.notEqual(audit.isError, true, audit.content?.[0]?.text);
    assert.equal(JSON.parse(audit.content[0].text).status, 'APPROVED');
    assert.equal(JSON.parse(fs.readFileSync(workspaceAudit, 'utf8')).compliance_score, 1);

    const beforeMerge = fs.readdirSync(path.join(matrix, 'capsules')).length;
    const merge = await client.callTool({ name: 'genos_merge', arguments: {
      branch_id: 'sandbox_boundary', conditions: 'all invariants passed' } });
    assert.equal(merge.isError, true, 'unverified capsule metadata must not claim a branch merge');
    assert.match(merge.content[0].text, /Merge not implemented:.*invariants/);
    assert.equal(fs.readdirSync(path.join(matrix, 'capsules')).length, beforeMerge);

    const fork = await client.callTool({ name: 'genos_v2_fork', arguments: { parent_id: 'mcp-parent' } });
    assert.equal(fork.isError, true, 'a generated UUID without child state is not a fork');
    assert.match(fork.content[0].text, /Agent fork not implemented:.*child state/);
  } finally {
    await client.close();
  }

  const blockedRoot = path.join(temporary, 'blocked-root');
  fs.writeFileSync(blockedRoot, 'not a directory');
  const blockedClient = await connect(blockedRoot);
  try {
    const failed = await blockedClient.callTool({ name: 'genos_capsule_create', arguments: {
      snapshot_id: 'fixture-snapshot' } });
    assert.equal(failed.isError, true, 'failed persistence must not report a successful capsule');
    assert.match(failed.content[0].text, /Failed to create capsule directory/);
  } finally {
    await blockedClient.close();
  }
  const isolatedRoot = path.join(temporary, 'init-root');
  fs.mkdirSync(isolatedRoot);
  const initClient = await connect(isolatedRoot, isolatedRoot);
  try {
    const initialized = await initClient.callTool({ name: 'genos_v2_init', arguments: {} });
    assert.notEqual(initialized.isError, true, initialized.content?.[0]?.text);
    assert.equal(JSON.parse(initialized.content[0].text).success, true);
    for (const directory of ['snapshots', 'capsules', '.genos']) {
      assert.ok(fs.statSync(path.join(isolatedRoot, directory)).isDirectory());
    }
  } finally {
    await initClient.close();
  }
  console.log('Native capsule, audit and isolated init proof; write-failure, merge and phantom-fork refusals verified.');
} finally {
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
  assert.ok(path.resolve(workspaceTemporary).startsWith(`${path.resolve(root)}${path.sep}`));
  fs.rmSync(workspaceTemporary, { recursive: true, force: true });
}
