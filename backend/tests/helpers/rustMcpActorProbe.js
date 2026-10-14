'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const actor = require('../../src/services/mcpActorCapability');
const receipts = require('../../src/services/bodyActionReceiptService');

async function probe(ctx, filename, workspace) {
  const token = await actor.issue(ctx.db, { agentId: ctx.agentId,
    runId: ctx.executionRun.id, workspaceRoot: workspace });
  const request = { token, workspaceRoot: workspace, toolName: 'genos_search_failures' };
  await assert.rejects(actor.begin(ctx.db, { ...request, token: '0'.repeat(64) }),
    { code: 'MCP_ACTOR_TOKEN_REVOKED' });
  await assert.rejects(actor.begin(ctx.db, { ...request, toolName: 'genos_fork' }),
    { code: 'MCP_ACTOR_TOOL_DENIED' });
  await assert.rejects(actor.begin(ctx.db, { ...request, workspaceRoot: path.dirname(workspace) }),
    { code: 'MCP_ACTOR_WORKSPACE_MISMATCH' });
  const bridge = path.resolve(__dirname, '../../bin/genos-mcp-actor-bridge.cjs');
  const env = { ...process.env, GENOS_MCP_ACTOR_TOKEN: token,
    GENOS_WORKSPACE_ROOT: workspace, GENOS_DB_PATH: filename };
  const started = spawnSync(process.execPath, [bridge, 'begin', request.toolName],
    { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(started.status, 0, started.stderr);
  const receipt = JSON.parse(started.stdout);
  assert.equal(receipt.agentId, ctx.agentId);
  const finished = spawnSync(process.execPath,
    [bridge, 'finish', request.toolName, receipt.actionId, 'true', 'a'.repeat(64)],
    { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(finished.status, 0, finished.stderr);
  assert.equal((await receipts.read(ctx.db, receipt.actionId)).phase, 'observed');
  await probeRustBinary(ctx, env, workspace);
  await rejectFinishAfterRevocation(ctx, workspace);
  await rejectFinishAfterExpiration(ctx, workspace);
  await actor.revoke(ctx.db, token);
  await assert.rejects(actor.begin(ctx.db, request), { code: 'MCP_ACTOR_TOKEN_REVOKED' });
}

async function rejectFinishAfterRevocation(ctx, workspace) {
  const token = await actor.issue(ctx.db, { agentId: ctx.agentId,
    runId: ctx.executionRun.id, workspaceRoot: workspace });
  const request = { token, workspaceRoot: workspace, toolName: 'genos_search_failures' };
  const predicted = await actor.begin(ctx.db, request);
  await actor.revoke(ctx.db, token);
  await assert.rejects(actor.finish(ctx.db, { ...request, actionId: predicted.actionId,
    success: true, outputHash: 'b'.repeat(64) }), { code: 'MCP_ACTOR_TOKEN_REVOKED' });
  assert.equal((await receipts.read(ctx.db, predicted.actionId)).phase, 'predicted');
}

async function rejectFinishAfterExpiration(ctx, workspace) {
  const token = await actor.issue(ctx.db, { agentId: ctx.agentId,
    runId: ctx.executionRun.id, workspaceRoot: workspace });
  const request = { token, workspaceRoot: workspace, toolName: 'genos_search_failures' };
  const predicted = await actor.begin(ctx.db, request);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await ctx.db.run('UPDATE mcp_actor_capabilities SET expires_at = ? WHERE token_hash = ?',
    new Date(Date.now() - 1000).toISOString(), tokenHash);
  await assert.rejects(actor.finish(ctx.db, { ...request, actionId: predicted.actionId,
    success: true, outputHash: 'c'.repeat(64) }), { code: 'MCP_ACTOR_TOKEN_REVOKED' });
  assert.equal((await receipts.read(ctx.db, predicted.actionId)).phase, 'predicted');
}

async function probeRustBinary(ctx, env, workspace) {
  const binary = path.resolve(__dirname, '../../../target/debug',
    process.platform === 'win32' ? 'genos-mcp.exe' : 'genos-mcp');
  if (!(await fs.stat(binary).catch(() => null))?.isFile()) return;
  const request = { jsonrpc: '2.0', id: 9, method: 'tools/call',
    params: { name: 'genos_search_failures', arguments: {
      agentId: 'parent', query: 'body-model-probe' } } };
  const rust = spawnSync(binary, [], { cwd: workspace, env: { ...env,
    GENOS_MCP_LEASE: 'genos_search_failures' }, input: `${JSON.stringify(request)}\n`,
  encoding: 'utf8', timeout: 30000 });
  assert.equal(rust.status, 0, rust.stderr);
  const response = JSON.parse(rust.stdout.trim());
  assert.equal(response.result._meta['genos.body'].attribution, 'agent_bound');
  assert.equal(response.result._meta['genos.body'].agentId, ctx.agentId);
  const action = response.result._meta['genos.body'].actionId;
  assert.equal((await receipts.read(ctx.db, action)).phase, 'observed');
}

module.exports = { probe };
