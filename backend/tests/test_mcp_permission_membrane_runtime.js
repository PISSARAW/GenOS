'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bridge = require('../src/services/mcpExecutor/permissionMembraneBridge');

function context(input) {
  return {
    db: input.db,
    request: {
      callId: input.callId, agentId: 'worker-runtime', runId: 'run-7',
      organizationId: 'org-1', projectId: 'project-1',
      toolName: 'genos_snapshot', args: { agent: 'worker-runtime', out: 'snapshot.json' }
    },
    policy: { decision: input.decision, reason: `${input.decision}_by_test` },
    binding: { status: 'legacy_unbound' },
    operation: input.operation
  };
}

async function assertAllow(db) {
  let executions = 0;
  const result = await bridge.executeAuthorized(context({ db, callId: 'runtime-allow', decision: 'allow', operation: async () => {
    executions += 1;
    return { success: true, status: 'completed', output: { ok: true } };
  } }));
  assert.equal(executions, 1);
  assert.equal(result.success, true);
  assert.equal(result.permissionReceipt.decision, 'allow');
  assert.equal(result.permissionReceipt.resultStatus, 'completed');
  assert.match(result.permissionReceipt.resultHash, /^[a-f0-9]{64}$/);
}

async function assertDeny(db) {
  let executions = 0;
  const result = await bridge.executeAuthorized(context({ db, callId: 'runtime-deny', decision: 'deny', operation: async () => {
    executions += 1;
  } }));
  assert.equal(executions, 0);
  assert.equal(result.status, 'deny');
  assert.equal(result.permissionReceipt.decision, 'deny');
  assert.equal(result.permissionReceipt.resultHash, null);
}

async function assertAsk(db) {
  let executions = 0;
  const result = await bridge.executeAuthorized(context({ db, callId: 'runtime-ask', decision: 'approval_required', operation: async () => {
    executions += 1;
  } }));
  assert.equal(executions, 0);
  assert.equal(result.status, 'approval_required');
  assert.equal(result.permissionReceipt.decision, 'ask');
  assert.equal(result.permissionReceipt.resultHash, null);
}

async function assertApprovedAsk(db) {
  let executions = 0;
  const runtime = context({ db, callId: 'runtime-approved-ask', decision: 'approval_required', operation: async () => {
    executions += 1;
    return { success: true, status: 'completed' };
  } });
  const bindingHash = require('../src/services/toolPermissionMembraneService')
    .toolCallBindingHash(bridge.permissionInput(runtime));
  runtime.request.approval = {
    id: 'approval-runtime', status: 'approved', decision_by: 'operator-1',
    payload_json: JSON.stringify({ membraneBindingHash: bindingHash }),
    payload_hash: 'a'.repeat(64)
  };
  const result = await bridge.executeAuthorized(runtime);
  assert.equal(executions, 1);
  assert.equal(result.permissionReceipt.decision, 'allow');
  assert.equal(result.permissionReceipt.resultStatus, 'completed');
}

async function assertLeaseDenial(db) {
  process.env.GENOS_MCP_LEASE = 'genos_replay';
  let executions = 0;
  const result = await bridge.executeAuthorized(context({ db, callId: 'runtime-lease-deny', decision: 'allow', operation: async () => {
    executions += 1;
  } }));
  assert.equal(executions, 0);
  assert.equal(result.permissionReceipt.reason, 'tool_outside_lease');
}

async function run() {
  const previousLease = process.env.GENOS_MCP_LEASE;
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    process.env.GENOS_MCP_LEASE = 'genos_snapshot';
    await assertAllow(db);
    await assertDeny(db);
    await assertAsk(db);
    await assertApprovedAsk(db);
    await assertLeaseDenial(db);
    const rows = await db.all('SELECT effective_decision, result_status FROM tool_permission_receipts ORDER BY call_id');
    assert.equal(rows.length, 5);
    console.log('MCP permission membrane runtime bridge: allow, deny, ask, approval and lease denial passed.');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
