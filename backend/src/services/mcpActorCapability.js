'use strict';

const crypto = require('node:crypto');
const authority = require('./missionEnvelopeAuthority');
const receipts = require('./bodyActionReceiptService');
const { withTransaction } = require('../db');
const { migrateMcpActorLeaseV2 } = require('../db/migrations/migrateMcpActorLeaseV2');

function digest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refusal(code) {
  return Object.assign(new Error(code), { code });
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function callBudget(bound, requested) {
  const ceiling = positiveInteger(bound.envelope.budgets?.events
    ?? bound.envelope.limits?.events);
  if (!ceiling) throw refusal('MCP_ACTOR_BUDGET_REQUIRED');
  if (requested === undefined) return ceiling;
  const normalized = positiveInteger(requested);
  if (!normalized || normalized > ceiling) throw refusal('MCP_ACTOR_BUDGET_INVALID');
  return normalized;
}

async function nextSequence(db, tokenHash) {
  const row = await db.get(`SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
    FROM mcp_actor_lease_receipts WHERE token_hash = ?`, tokenHash);
  return row.sequence;
}

async function appendReceipt(db, input) {
  const sequence = await nextSequence(db, input.tokenHash);
  await db.run(`INSERT INTO mcp_actor_lease_receipts
    (receipt_id, token_hash, sequence, kind, disposition, reason, tool_name,
      action_id, authority_hash, workspace_root)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, `mcp-lease-${crypto.randomUUID()}`,
  input.tokenHash, sequence, input.kind, input.disposition, input.reason,
  input.toolName || null, input.actionId || null, input.row.authority_hash,
  input.row.workspace_root);
}

async function issue(db, input) {
  const bound = await authority.assertRun(db, input);
  if (bound.status !== 'authorized') throw refusal('MCP_ACTOR_AUTHORITY_REQUIRED');
  const root = await authority.realWorkspaceRoot(input.workspaceRoot);
  if (root !== bound.envelope.workspaceRoot) throw refusal('MCP_ACTOR_WORKSPACE_MISMATCH');
  const maxCalls = callBudget(bound, input.maxCalls);
  await migrateMcpActorLeaseV2(db);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = digest(token);
  await withTransaction(db, async () => {
    await db.run(`INSERT INTO mcp_actor_capabilities
      (token_hash, agent_id, run_id, authority_hash, workspace_root, expires_at,
        max_calls, calls_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)`, tokenHash, input.agentId, input.runId,
    bound.hash, root, bound.envelope.expiresAt, maxCalls);
    const row = await load(db, tokenHash);
    await appendReceipt(db, { tokenHash, row, kind: 'issue', disposition: 'active',
      reason: 'authority_bound_lease_issued' });
  });
  return token;
}

async function load(db, tokenHash) {
  return db.get('SELECT * FROM mcp_actor_capabilities WHERE token_hash = ?', tokenHash);
}

function lifecycleDecision(row, tokenHash) {
  if (row.revoked_at) {
    return { row, tokenHash, code: 'MCP_ACTOR_TOKEN_REVOKED', reason: 'lease_revoked' };
  }
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    return { row, tokenHash, code: 'MCP_ACTOR_TOKEN_REVOKED', reason: 'lease_expired' };
  }
  if (!positiveInteger(row.max_calls) || !Number.isSafeInteger(row.calls_used)) {
    return { row, tokenHash, code: 'MCP_ACTOR_BUDGET_INVALID', reason: 'budget_invalid' };
  }
  return null;
}

async function authorityDecision(db, row, tokenHash) {
  let bound;
  try {
    bound = await authority.assertRun(db, { agentId: row.agent_id, runId: row.run_id });
  } catch (_) {
    return { row, tokenHash, code: 'MCP_ACTOR_AUTHORITY_CHANGED', reason: 'authority_changed' };
  }
  if (bound.status !== 'authorized' || bound.hash !== row.authority_hash) {
    return { row, tokenHash, code: 'MCP_ACTOR_AUTHORITY_CHANGED', reason: 'authority_changed' };
  }
  return { row, tokenHash, bound };
}

async function scopeDecision(input, decision) {
  const root = await authority.realWorkspaceRoot(input.workspaceRoot);
  if (root !== decision.row.workspace_root) {
    return { ...decision, code: 'MCP_ACTOR_WORKSPACE_MISMATCH', reason: 'workspace_mismatch' };
  }
  if (!decision.bound.envelope.toolLease.includes(input.toolName)) {
    return { ...decision, code: 'MCP_ACTOR_TOOL_DENIED', reason: 'tool_outside_sealed_lease' };
  }
  return decision;
}

async function evaluate(db, input) {
  if (!/^[a-f0-9]{64}$/.test(input.token || '')) {
    return { code: 'MCP_ACTOR_TOKEN_INVALID', reason: 'token_invalid' };
  }
  const tokenHash = digest(input.token);
  const row = await load(db, tokenHash);
  if (!row) return { code: 'MCP_ACTOR_TOKEN_REVOKED', reason: 'token_unknown' };
  const lifecycle = lifecycleDecision(row, tokenHash);
  if (lifecycle) return lifecycle;
  const bound = await authorityDecision(db, row, tokenHash);
  if (bound.code) return bound;
  return scopeDecision(input, bound);
}

async function verify(db, input) {
  await migrateMcpActorLeaseV2(db);
  const decision = await evaluate(db, input);
  if (decision.code) throw refusal(decision.code);
  return decision.row;
}

async function begin(db, input) {
  await migrateMcpActorLeaseV2(db);
  const decision = await withTransaction(db, () => decideBegin(db, input));
  if (decision.code) throw refusal(decision.code);
  return decision.receipt;
}

async function decideBegin(db, input) {
  const decision = await evaluate(db, input);
  if (decision.code) {
    if (decision.row) await appendReceipt(db, { ...decision, kind: 'decision',
      disposition: 'refuse', toolName: input.toolName });
    return decision;
  }
  const changed = await db.run(`UPDATE mcp_actor_capabilities
    SET calls_used = calls_used + 1
    WHERE token_hash = ? AND revoked_at IS NULL AND calls_used < max_calls`,
  decision.tokenHash);
  if (changed.changes !== 1) {
    const denied = { ...decision, code: 'MCP_ACTOR_BUDGET_EXHAUSTED',
      reason: 'tool_call_budget_exhausted' };
    await appendReceipt(db, { ...denied, kind: 'decision', disposition: 'refuse',
      toolName: input.toolName });
    return denied;
  }
  const actionId = receipts.actionId();
  await receipts.predict({ db, agentId: decision.row.agent_id, runId: decision.row.run_id,
    effectorId: 'mcp_stdio', actionId,
    prediction: { toolName: input.toolName, expected: 'stdio_tool_result' } });
  await appendReceipt(db, { ...decision, kind: 'decision', disposition: 'allow',
    reason: 'bounded_lease_allows_tool', toolName: input.toolName, actionId });
  return { receipt: { actionId, agentId: decision.row.agent_id,
    runId: decision.row.run_id, authorityHash: decision.row.authority_hash,
    toolName: input.toolName, workspaceRoot: decision.row.workspace_root } };
}

async function finish(db, input) {
  if (typeof input.success !== 'boolean' || !/^[a-f0-9]{64}$/.test(input.outputHash || '')) {
    throw refusal('MCP_ACTOR_OUTCOME_INVALID');
  }
  return withTransaction(db, async () => {
    const row = await verify(db, input);
    const predicted = await receipts.read(db, input.actionId);
    if (!matchesPredictedReceipt(predicted, row, input)) {
      throw refusal('MCP_ACTOR_RECEIPT_MISMATCH');
    }
    const observed = await receipts.observe({ db, agentId: row.agent_id,
      runId: row.run_id, effectorId: 'mcp_stdio', actionId: input.actionId,
      outcome: { status: input.success ? 'completed' : 'failed', outputHash: input.outputHash } });
    if (!observed.matched) throw refusal('MCP_ACTOR_RECEIPT_MISMATCH');
    await appendReceipt(db, { tokenHash: digest(input.token), row, kind: 'observation',
      disposition: input.success ? 'technical_success' : 'technical_failure',
      reason: input.success ? 'transport_completed' : 'transport_failed',
      toolName: input.toolName, actionId: input.actionId });
    return observed;
  });
}

function matchesPredictedReceipt(receipt, capability, input) {
  return receipt?.phase === 'predicted'
    && receipt.agentId === capability.agent_id
    && receipt.runId === capability.run_id
    && receipt.effectorId === 'mcp_stdio'
    && receipt.authorityHash === capability.authority_hash
    && receipt.prediction?.toolName === input.toolName;
}

async function revoke(db, token, reason = 'runtime_stopped') {
  await migrateMcpActorLeaseV2(db);
  return withTransaction(db, async () => {
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw refusal('MCP_ACTOR_TOKEN_INVALID');
    const tokenHash = digest(token);
    const row = await load(db, tokenHash);
    if (!row) return { revoked: false };
    const changed = await db.run(`UPDATE mcp_actor_capabilities
      SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL`, tokenHash);
    if (changed.changes === 1) await appendReceipt(db, { tokenHash, row,
      kind: 'revocation', disposition: 'revoked', reason });
    return { revoked: changed.changes === 1 };
  });
}

module.exports = { issue, verify, begin, finish, revoke };
