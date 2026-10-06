'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { applySomaticCandidate, rollbackSomaticApplication } = require('../src/services/gvxSomaticApplication');

const input = {
  scope: { organizationId: 'org', projectId: 'project' }, entityId: 'agent',
  applicationId: 'application-1', parentHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64), change: {}
};

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  let applied = 0;
  let rolledBack = 0;
  const adapters = {
    authorization: { authorize: async () => ({ allowed: true, approvalId: 'approval-1' }) },
    runtime: {
      apply: async () => { applied += 1; return { beforeHash: input.parentHash, afterHash: input.candidateHash, rollbackToken: 'restore-1' }; },
      rollback: async () => { rolledBack += 1; return { restoredHash: input.parentHash }; }
    }
  };
  try {
    await migrateGvxLedger(db);
    const first = await applySomaticCandidate(db, { ...input, ...adapters });
    const replay = await applySomaticCandidate(db, { ...input, ...adapters });
    assert.strictEqual(first.id, replay.id);
    assert.strictEqual(applied, 1);
    const rollback = await rollbackSomaticApplication(db, { ...input, ...adapters });
    assert.strictEqual(rollback.payload.result.status, 'restored');
    assert.strictEqual(rolledBack, 1);
    const denied = { ...adapters, authorization: { authorize: async () => ({ allowed: false }) } };
    await assert.rejects(applySomaticCandidate(db, { ...input, applicationId: 'denied', ...denied }), { code: 'GVX_APPLICATION_NOT_AUTHORIZED' });
    assert.strictEqual(applied, 1);
  } finally { await db.close(); }
  console.log('GVX somatic application checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
