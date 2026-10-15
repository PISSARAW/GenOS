'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
process.env.GENOS_SECRET_KEY ||= 'tool-permission-membrane-test-key-32-bytes';
const membrane = require('../src/services/toolPermissionMembraneService');
const adapters = require('../src/services/toolPermissionMembraneAdapters');

function request(callId, decision = 'allow') {
  return {
    callId,
    tool: { name: 'genos_snapshot', version: '1.4.0' },
    arguments: { z: 3, a: ['stable', true] },
    worker: { id: 'worker-1', revision: 'genome-r7' },
    lease: { id: 'lease-9', tools: ['genos_snapshot', 'genos_replay'] },
    policy: { id: 'membrane-policy', version: '3', decision },
    authorityChecks: [
      { source: 'cedar', decision: 'allow', deciderId: 'cedar-agent-authority' },
      { source: 'worker-contract', decision: 'allow', deciderId: 'worker-contract-v2' }
    ],
    organizationId: 'org-1',
    projectId: 'project-1'
  };
}

async function assertFailClosedDecisions(db) {
  const noAuthority = request('call-no-authority');
  delete noAuthority.authorityChecks;
  const denied = await membrane.authorizeToolCall(db, noAuthority);
  assert.equal(denied.decision, 'deny');
  assert.equal(denied.reason, 'authority_unverified');
  assert.equal(denied.executable, false);

  const cedarDenied = request('call-cedar-denied');
  cedarDenied.authorityChecks[0].decision = 'deny';
  cedarDenied.authorityChecks[0].reason = 'cedar_scope_denied';
  const refused = await membrane.authorizeToolCall(db, cedarDenied);
  assert.equal(refused.decision, 'deny');
  assert.equal(refused.reason, 'cedar_scope_denied');

  const outsideLease = request('call-outside-lease');
  outsideLease.lease.tools = ['genos_replay'];
  const bounded = await membrane.authorizeToolCall(db, outsideLease);
  assert.equal(bounded.decision, 'deny');
  assert.equal(bounded.reason, 'tool_outside_lease');
}

async function assertAllowAndResultReceipt(db) {
  const input = request('call-allowed');
  const allowed = await membrane.authorizeToolCall(db, input);
  assert.equal(allowed.decision, 'allow');
  assert.equal(allowed.executable, true);
  assert.match(allowed.authorizationHash, /^[a-f0-9]{64}$/);

  const settled = await membrane.settleToolCall(db, {
    receiptId: allowed.receiptId,
    status: 'completed',
    result: { value: 42, success: true },
    reporterId: 'mcp-executor'
  });
  assert.equal(settled.resultStatus, 'completed');
  assert.match(settled.resultHash, /^[a-f0-9]{64}$/);
  assert.notEqual(settled.receiptHash, allowed.receiptHash);

  const repeated = await membrane.settleToolCall(db, {
    receiptId: allowed.receiptId,
    status: 'completed',
    result: { success: true, value: 42 },
    reporterId: 'mcp-executor'
  });
  assert.equal(repeated.replayed, true);
  await assert.rejects(() => membrane.settleToolCall(db, {
    receiptId: allowed.receiptId,
    status: 'completed',
    result: { success: false },
    reporterId: 'mcp-executor'
  }), (error) => error.code === 'TOOL_MEMBRANE_RESULT_CONFLICT');

  const row = await db.get('SELECT * FROM tool_permission_receipts WHERE receipt_id = ?', allowed.receiptId);
  assert.equal(row.tool_name, 'genos_snapshot');
  assert.equal(row.tool_version, '1.4.0');
  assert.equal(row.worker_revision, 'genome-r7');
  assert.equal(row.lease_id, 'lease-9');
  assert.match(row.lease_hash, /^[a-f0-9]{64}$/);
  assert.equal(row.policy_decision, 'allow');
  assert.equal(row.result_reporter, 'mcp-executor');
}

async function assertAskFlow(db) {
  const pendingInput = request('call-ask-pending', 'ask');
  const pending = await membrane.authorizeToolCall(db, pendingInput);
  assert.equal(pending.decision, 'ask');
  assert.equal(pending.executable, false);
  await assert.rejects(() => membrane.settleToolCall(db, {
    receiptId: pending.receiptId, status: 'completed', result: {}, reporterId: 'mcp-executor'
  }), (error) => error.code === 'TOOL_MEMBRANE_NOT_AUTHORIZED');

  const approvedInput = request('call-ask-approved', 'ask');
  approvedInput.approval = {
    id: 'approval-1', status: 'approved', deciderId: 'human-reviewer',
    bindingHash: membrane.toolCallBindingHash(approvedInput),
    payloadHash: membrane.digest({ action: 'tool:genos_snapshot', approved: true })
  };
  const approved = await membrane.authorizeToolCall(db, approvedInput);
  assert.equal(approved.decision, 'allow');

  const selfApprovedInput = request('call-ask-self-approved', 'ask');
  selfApprovedInput.approval = {
    id: 'approval-2', status: 'approved', deciderId: 'worker-1',
    bindingHash: membrane.toolCallBindingHash(selfApprovedInput),
    payloadHash: membrane.digest({ approved: true })
  };
  const selfApproved = await membrane.authorizeToolCall(db, selfApprovedInput);
  assert.equal(selfApproved.decision, 'deny');
  assert.equal(selfApproved.reason, 'approval_invalid_or_unbound');
}

async function assertEvaluateFlow(db) {
  const pendingInput = request('call-evaluate-pending', 'evaluate');
  const pending = await membrane.authorizeToolCall(db, pendingInput);
  assert.equal(pending.decision, 'evaluate');

  const evaluatedInput = request('call-evaluate-allowed', 'evaluate');
  evaluatedInput.evaluation = {
    decision: 'allow', evaluatorId: 'policy-engine-2',
    bindingHash: membrane.toolCallBindingHash(evaluatedInput),
    evidenceHash: membrane.digest({ ruleset: 'zero-trust-v4', result: 'allow' })
  };
  const evaluated = await membrane.authorizeToolCall(db, evaluatedInput);
  assert.equal(evaluated.decision, 'allow');
  assert.equal(evaluated.executable, true);

  const unboundInput = request('call-evaluate-unbound', 'evaluate');
  unboundInput.evaluation = {
    decision: 'allow', evaluatorId: 'policy-engine-2',
    bindingHash: '0'.repeat(64), evidenceHash: '1'.repeat(64)
  };
  const unbound = await membrane.authorizeToolCall(db, unboundInput);
  assert.equal(unbound.decision, 'deny');
  assert.equal(unbound.reason, 'evaluation_invalid_or_unbound');
}

async function assertIdempotency(db) {
  const first = request('call-idempotent');
  const receipt = await membrane.authorizeToolCall(db, first);
  const replay = await membrane.authorizeToolCall(db, first);
  assert.equal(replay.receiptId, receipt.receiptId);
  assert.equal(replay.replayed, true);

  const conflict = request('call-idempotent');
  conflict.arguments = { changed: true };
  await assert.rejects(() => membrane.authorizeToolCall(db, conflict),
    (error) => error.code === 'TOOL_MEMBRANE_CALL_CONFLICT');
}

async function assertConcurrentSettlement(db) {
  const allowed = await membrane.authorizeToolCall(db, request('call-concurrent-result'));
  const outcomes = await Promise.allSettled([
    membrane.settleToolCall(db, {
      receiptId: allowed.receiptId, status: 'completed', result: { winner: 'a' },
      reporterId: 'mcp-executor-a'
    }),
    membrane.settleToolCall(db, {
      receiptId: allowed.receiptId, status: 'failed', result: { winner: 'b' },
      reporterId: 'mcp-executor-b'
    })
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((entry) => entry.status === 'rejected');
  assert.equal(rejected.reason.code, 'TOOL_MEMBRANE_RESULT_CONFLICT');
}

async function assertAuthorizationIsImmutable(db) {
  const allowed = await membrane.authorizeToolCall(db, request('call-immutable'));
  await assert.rejects(() => db.run(
    "UPDATE tool_permission_receipts SET effective_decision='deny' WHERE receipt_id=?",
    allowed.receiptId
  ), /TOOL_PERMISSION_AUTHORIZATION_IMMUTABLE/);
  await assert.rejects(() => db.run(
    'UPDATE tool_permission_receipts SET authorization_hash=? WHERE receipt_id=?',
    '0'.repeat(64), allowed.receiptId
  ), /TOOL_PERMISSION_AUTHORIZATION_IMMUTABLE/);
  await assert.rejects(() => db.run(
    'DELETE FROM tool_permission_receipts WHERE receipt_id=?', allowed.receiptId
  ), /TOOL_PERMISSION_RECEIPT_IMMUTABLE/);
}

function assertLegacyAdapters() {
  assert.deepEqual(adapters.platformSafetyPolicy({
    decision: 'approval_required', reason: 'high_impact_tool'
  }), {
    id: 'platform-safety', version: 'legacy-v1', decision: 'ask', reason: 'high_impact_tool'
  });
  assert.equal(adapters.platformSafetyPolicy({ decision: 'unknown' }).decision, 'deny');
  assert.equal(adapters.cedarAuthorityCheck(true).decision, 'allow');
  assert.equal(adapters.cedarAuthorityCheck(undefined).decision, 'deny');
  assert.deepEqual(adapters.leaseContract('lease-1', [' GENOS_SNAPSHOT ', null]).tools,
    ['genos_snapshot']);
  assert.deepEqual(adapters.platformApproval({
    id: 'approval-3', status: 'approved', decision_by: 'operator',
    payload_hash: 'a'.repeat(64),
    payload_json: JSON.stringify({ membraneBindingHash: 'b'.repeat(64) })
  }), {
    id: 'approval-3', status: 'approved', deciderId: 'operator',
    bindingHash: 'b'.repeat(64), payloadHash: 'a'.repeat(64)
  });
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await assertFailClosedDecisions(db);
    await assertAllowAndResultReceipt(db);
    await assertAskFlow(db);
    await assertEvaluateFlow(db);
    await assertIdempotency(db);
    await assertConcurrentSettlement(db);
    await assertAuthorizationIsImmutable(db);
    assertLegacyAdapters();
    const count = await db.get('SELECT COUNT(*) AS count FROM tool_permission_receipts');
    assert.equal(count.count, 13);
    console.log('Tool permission membrane: all assertions passed.');
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
