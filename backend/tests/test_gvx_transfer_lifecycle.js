'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { startTransfer, advanceTransfer } = require('../src/services/gvxTransferLifecycle');

function startInput() {
  return {
    scope: { organizationId: 'org-a', projectId: 'project-a' }, entityId: 'organism-a',
    sourceLineage: 'lineage-donor', contextHash: 'a'.repeat(64),
    plasmid: { id: 'plasmid-1', capability: 'analyze', code: 'safe', requiredTools: [], requiredAuthority: 'execute' },
    recipient: { id: 'organism-a', phenotype: 'generalist', capabilities: ['analyze'],
      authorityProfile: { execute: true }, immuneStatus: 'healthy', toolLease: [] }
  };
}

function trialEvidence() {
  return [{ artifactHash: 'b'.repeat(64), verifierId: 'trial-verifier-a' },
    { artifactHash: 'c'.repeat(64), verifierId: 'trial-verifier-b' }];
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const started = await startTransfer(db, startInput());
    const transferId = started.payload.transfer.transferId;
    assert.strictEqual(started.payload.transfer.state, 'quarantined');
    const scope = { ...startInput().scope, entityId: 'organism-a', transferId };
    const trial = await advanceTransfer(db, { ...scope, state: 'trial' });
    assert.strictEqual(trial.payload.transfer.state, 'trial');
    await assert.rejects(advanceTransfer(db, { ...scope, state: 'review_ready', minTrials: 2, trialEvidence: [] }), {
      code: 'GVX_TRANSFER_EVIDENCE_REQUIRED'
    });
    const ready = await advanceTransfer(db, { ...scope, state: 'review_ready', minTrials: 2, trialEvidence: trialEvidence() });
    assert.strictEqual(ready.payload.transfer.state, 'review_ready');
    assert.strictEqual(ready.payload.transfer.rationale, 'review_ready');
    await assert.rejects(advanceTransfer(db, { ...scope, state: 'assimilated' }), { code: 'GVX_TRANSFER_EVIDENCE_REQUIRED' });
    const assimilated = await advanceTransfer(db, { ...scope, state: 'assimilated', recipientOutcome: {
      artifactHash: 'd'.repeat(64), verifierId: 'recipient-verifier', metric: 'taskSuccess',
      baseline: 0.5, candidate: 0.8, direction: 'higher', regression: false
    } });
    assert.strictEqual(assimilated.payload.transfer.state, 'assimilated');
    await assert.rejects(advanceTransfer(db, { ...scope, state: 'monitored' }), { code: 'GVX_TRANSFER_EVIDENCE_REQUIRED' });
    const monitoring = { windows: ['a', 'b'].map((value) => ({ contextHash: value.repeat(64),
      artifactHash: value.repeat(64), verifierId: `monitor-${value}`, regression: false })) };
    const monitored = await advanceTransfer(db, { ...scope, state: 'monitored', monitoring });
    assert.strictEqual(monitored.payload.transfer.state, 'monitored');
    const consolidated = await advanceTransfer(db, { ...scope, state: 'consolidated', monitoring: {
      windows: ['a', 'b', 'c'].map((value) => ({ contextHash: value.repeat(64),
        artifactHash: value.repeat(64), verifierId: `monitor-${value}`, regression: false }))
    } });
    assert.strictEqual(consolidated.payload.transfer.state, 'consolidated');
  } finally { await db.close(); }
  console.log('GVX transfer lifecycle checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
