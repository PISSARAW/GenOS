'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const actor = require('../../src/services/mcpActorCapability');

async function connect(token, filename, workspace) {
  const root = path.resolve(__dirname, '../../..');
  const sdk = path.join(root, 'mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client');
  const { Client } = await import(pathToFileURL(path.join(sdk, 'index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'stdio.js')).href);
  const client = new Client({ name: 'node-actor-lease-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(root, 'mcp/index.js')], cwd: root, stderr: 'pipe',
    env: { ...process.env, GENOS_MCP_LEASE: 'genos_search_failures',
      GENOS_MCP_ACTOR_TOKEN: token, GENOS_WORKSPACE_ROOT: workspace,
      GENOS_DB_PATH: filename, GENOS_DB_BACKUP_SKIP: '1',
      GENOS_DB_BOOTSTRAP_SKIP: '1', NODE_ENV: 'test' } });
  transport.stderr.on('data', () => {});
  await client.connect(transport);
  return client;
}

async function call(client) {
  return client.callTool({ name: 'genos_search_failures',
    arguments: { agentId: 'worker', query: 'phase-4-lease-probe', limit: 1 } });
}

async function budgetProbe(ctx, filename, workspace) {
  const token = await actor.issue(ctx.db, { agentId: ctx.agentId,
    runId: ctx.executionRun.id, workspaceRoot: workspace, maxCalls: 1 });
  const client = await connect(token, filename, workspace);
  try {
    const allowed = await call(client);
    assert.notEqual(allowed.isError, true, allowed.content?.[0]?.text);
    assert.equal(allowed._meta['genos.body'].attribution, 'agent_bound');
    assert.equal(allowed._meta['genos.body'].agentId, ctx.agentId);
    const exhausted = await call(client);
    assert.equal(exhausted.isError, true);
    assert.match(exhausted.content[0].text, /MCP_ACTOR_BUDGET_EXHAUSTED/);
  } finally { await client.close(); }
  return token;
}

async function revocationProbe(ctx, filename, workspace) {
  const token = await actor.issue(ctx.db, { agentId: ctx.agentId,
    runId: ctx.executionRun.id, workspaceRoot: workspace, maxCalls: 2 });
  const client = await connect(token, filename, workspace);
  try {
    assert.notEqual((await call(client)).isError, true);
    assert.equal((await actor.revoke(ctx.db, token, 'operator_revoked')).revoked, true);
    const revoked = await call(client);
    assert.equal(revoked.isError, true);
    assert.match(revoked.content[0].text, /MCP_ACTOR_TOKEN_REVOKED/);
  } finally { await client.close(); }
  return token;
}

async function assertReceipts(ctx, tokens) {
  for (const token of tokens) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await ctx.db.all(`SELECT kind, disposition, reason
      FROM mcp_actor_lease_receipts WHERE token_hash = ? ORDER BY sequence`, tokenHash);
    assert.equal(rows[0].disposition, 'active');
    assert.ok(rows.some((row) => row.disposition === 'allow'));
    assert.ok(rows.some((row) => ['refuse', 'revoked'].includes(row.disposition)));
  }
  const receipt = await ctx.db.get(`SELECT receipt_id FROM mcp_actor_lease_receipts
    ORDER BY created_at, sequence LIMIT 1`);
  await assert.rejects(ctx.db.run(`UPDATE mcp_actor_lease_receipts SET reason = 'changed'
    WHERE receipt_id = ?`, receipt.receipt_id), /MCP_ACTOR_LEASE_RECEIPT_IMMUTABLE/);
}

async function probe(ctx, filename, workspace) {
  await ctx.db.exec(`CREATE TABLE IF NOT EXISTS genome_decisions (
    id TEXT PRIMARY KEY, title TEXT, content TEXT, created_by TEXT,
    category TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    embedding_blob BLOB, organization_id TEXT, project_id TEXT
  );`);
  const budgetToken = await budgetProbe(ctx, filename, workspace);
  const revokedToken = await revocationProbe(ctx, filename, workspace);
  await assertReceipts(ctx, [budgetToken, revokedToken]);
}

module.exports = { probe };
