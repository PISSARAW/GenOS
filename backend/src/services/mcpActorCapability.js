'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const authority = require('./missionEnvelopeAuthority');
const receipts = require('./bodyActionReceiptService');

function digest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mcp_actor_capabilities (
    token_hash TEXT PRIMARY KEY, agent_id TEXT NOT NULL, run_id TEXT NOT NULL,
    authority_hash TEXT NOT NULL, workspace_root TEXT NOT NULL,
    expires_at TEXT NOT NULL, revoked_at TEXT);`);
}

function refusal(code) {
  return Object.assign(new Error(code), { code });
}

async function issue(db, input) {
  const bound = await authority.assertRun(db, input);
  if (bound.status !== 'authorized') throw refusal('MCP_ACTOR_AUTHORITY_REQUIRED');
  const root = await fs.realpath(input.workspaceRoot);
  if (root !== bound.envelope.workspaceRoot) throw refusal('MCP_ACTOR_WORKSPACE_MISMATCH');
  await ensure(db);
  const token = crypto.randomBytes(32).toString('hex');
  await db.run(`INSERT INTO mcp_actor_capabilities
    (token_hash, agent_id, run_id, authority_hash, workspace_root, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`, digest(token), input.agentId, input.runId,
  bound.hash, root, bound.envelope.expiresAt);
  return token;
}

async function verify(db, input) {
  if (!/^[a-f0-9]{64}$/.test(input.token || '')) throw refusal('MCP_ACTOR_TOKEN_INVALID');
  await ensure(db);
  const row = await db.get('SELECT * FROM mcp_actor_capabilities WHERE token_hash = ?', digest(input.token));
  if (!row || row.revoked_at || Date.now() >= Date.parse(row.expires_at)) {
    throw refusal('MCP_ACTOR_TOKEN_REVOKED');
  }
  const bound = await authority.assertRun(db, { agentId: row.agent_id, runId: row.run_id });
  if (bound.status !== 'authorized' || bound.hash !== row.authority_hash) {
    throw refusal('MCP_ACTOR_AUTHORITY_CHANGED');
  }
  if (await fs.realpath(input.workspaceRoot) !== row.workspace_root) {
    throw refusal('MCP_ACTOR_WORKSPACE_MISMATCH');
  }
  if (!bound.envelope.toolLease.includes(input.toolName)) throw refusal('MCP_ACTOR_TOOL_DENIED');
  return row;
}

async function begin(db, input) {
  const row = await verify(db, input);
  const actionId = receipts.actionId();
  await receipts.predict({ db, agentId: row.agent_id, runId: row.run_id,
    effectorId: 'rust_mcp_stdio', actionId,
    prediction: { toolName: input.toolName, expected: 'stdio_tool_result' } });
  return { actionId, agentId: row.agent_id, runId: row.run_id,
    authorityHash: row.authority_hash };
}

async function finish(db, input) {
  const row = await db.get('SELECT * FROM mcp_actor_capabilities WHERE token_hash = ?', digest(input.token || ''));
  if (!row) throw refusal('MCP_ACTOR_TOKEN_INVALID');
  return receipts.observe({ db, agentId: row.agent_id, runId: row.run_id,
    effectorId: 'rust_mcp_stdio', actionId: input.actionId,
    outcome: { status: input.success ? 'completed' : 'failed', outputHash: input.outputHash } });
}

async function revoke(db, token) {
  await ensure(db);
  await db.run(`UPDATE mcp_actor_capabilities SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND revoked_at IS NULL`, digest(token));
}

module.exports = { issue, verify, begin, finish, revoke };
