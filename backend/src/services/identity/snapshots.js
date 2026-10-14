'use strict';

const crypto = require('crypto');
const ledger = require('./ledger');
const store = require('./storage');
const checkpoints = require('./checkpoints');

async function capture(db, input) {
  const bundle = input.state._genosSnapshot?.organismSnapshot;
  if (!bundle?.hash) return;
  return checkpoints.seal(db, { agentId: input.agentId, checkpointId: input.snapshotId,
    contentHash: bundle.hash, coverage: Object.keys(bundle.components || {}), anchorKind: 'capture' });
}

async function assertRestorable(db, agentId) {
  const head = await ledger.ensure(db, { agentId });
  if (head.lease_until > Date.now()) store.fail('IDENTITY_ACTIVE_DURING_RESTORE');
}

async function restored(db, input) {
  await assertRestorable(db, input.agentId);
  const hash = input.state._genosSnapshot?.organismSnapshot?.hash || store.hash(input.state);
  const head = await store.head(db, input.agentId);
  const checkpoint = await db.get('SELECT * FROM agent_identity_checkpoints WHERE agent_id = ? AND content_hash = ? LIMIT 1',
    input.agentId, hash);
  await ledger.append(db, { agentId: input.agentId, type: 'RESTORE', expectedRevision: head.revision,
    operationId: `restore:${input.operationId}`, causalRefs: checkpoint ? [checkpoint.head_hash] : [],
    payload: { contentHash: hash, sourceHead: checkpoint?.head_hash || null,
      sourceAnchor: checkpoint ? 'recorded_checkpoint' : 'legacy_unanchored',
      coverage: Object.keys(input.state._genosSnapshot?.organismSnapshot?.components || {}), externalEffectsReverted: false } });
  await db.run(`UPDATE agent_identity_heads SET incarnation_id = ?, fencing_token = fencing_token + 1,
    owner_id = NULL, lease_until = 0, life_state = 'alive' WHERE agent_id = ?`, `restored:${crypto.randomUUID()}`, input.agentId);
}

module.exports = { capture, assertRestorable, restored };
