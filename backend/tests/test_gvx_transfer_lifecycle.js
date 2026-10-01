'use strict';

const assert = require('assert');
const crypto = require('node:crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { startTransfer, advanceTransfer } = require('../src/services/gvxTransferLifecycle');
const { fromTrustedRegistry } = require('../src/services/gvxVerifierRegistry');

function artifact(id) {
  const artifactRef = `artifact:${id}`;
  return { artifactRef, artifactHash: crypto.createHash('sha256').update(artifactRef).digest('hex'), verifierId: 'artifact' };
}

const verifierRegistry = fromTrustedRegistry([{ id: 'artifact', requirements: ['transfer-trial', 'recipient-outcome', 'transfer-monitoring'],
  verify: async () => ({ verified: true }) }]);
const artifactReader = async ({ artifactRef }) => Buffer.from(artifactRef);

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
  return [artifact('trial-a'), artifact('trial-b')];
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
    const ready = await advanceTransfer(db, { ...scope, state: 'review_ready', minTrials: 2, trialEvidence: trialEvidence(), verifierRegistry, artifactReader });
    assert.strictEqual(ready.payload.transfer.state, 'review_ready');
    assert.strictEqual(ready.payload.transfer.rationale, 'review_ready');
    await assert.rejects(advanceTransfer(db, { ...scope, state: 'assimilated' }), { code: 'GVX_TRANSFER_EVIDENCE_REQUIRED' });
    const assimilated = await advanceTransfer(db, { ...scope, state: 'assimilated', recipientOutcome: {
      ...artifact('recipient'), metric: 'taskSuccess',
      baseline: 0.5, candidate: 0.8, direction: 'higher', regression: false
    }, verifierRegistry, artifactReader });
    assert.strictEqual(assimilated.payload.transfer.state, 'assimilated');
    await assert.rejects(advanceTransfer(db, { ...scope, state: 'monitored' }), { code: 'GVX_TRANSFER_EVIDENCE_REQUIRED' });
    const monitoring = { windows: ['a', 'b'].map((value) => ({ ...artifact(`monitor-${value}`), contextHash: value.repeat(64), regression: false })) };
    const monitored = await advanceTransfer(db, { ...scope, state: 'monitored', monitoring, verifierRegistry, artifactReader });
    assert.strictEqual(monitored.payload.transfer.state, 'monitored');
    const consolidated = await advanceTransfer(db, { ...scope, state: 'consolidated', monitoring: {
      windows: ['a', 'b', 'c'].map((value) => ({ ...artifact(`monitor-${value}`), contextHash: value.repeat(64), regression: false }))
    }, verifierRegistry, artifactReader });
    assert.strictEqual(consolidated.payload.transfer.state, 'consolidated');
  } finally { await db.close(); }
  console.log('GVX transfer lifecycle checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
