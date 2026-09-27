'use strict';

const assert = require('node:assert/strict');
const bridge = require('../src/services/rustBridgeEvidenceService');

const snapshot = { snapshot_id: 'snapshot-1', agent_id: 'agent-1', branch_id: 'main',
  genome: {}, state: {}, world_id: 'world-1', created_at: new Date().toISOString() };

async function main() {
  const invalid = bridge.buildSnapshotReceipt({ ...snapshot, created_at: 'not-a-date' },
    { ok: true, exitCode: 0 });
  assert.equal(invalid.eligible, false);
  const failed = bridge.buildSnapshotReceipt(snapshot, { ok: false, exitCode: 1 });
  assert.equal(failed.eligible, false);
  const valid = bridge.buildSnapshotReceipt(snapshot, { ok: true, exitCode: 0 },
    { organizationId: 'org', projectId: 'project' });
  assert.equal(valid.eligible, true);
  const writes = [];
  const persisted = await bridge.persistSnapshotReceipt({ run: async (...args) => { writes.push(args); } }, valid);
  assert.equal(writes.length, 1);
  assert.equal(persisted.receipt.source, 'genos-cli');
  assert.equal(persisted.receipt.payloadHash.length, 64);
  assert.deepEqual(writes[0].slice(-2), ['org', 'project']);
  console.log('Rust bridge snapshot receipt: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
