'use strict';

const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');

async function seal(db, input) {
  return withTransaction(db, async () => {
    const head = await ledger.ensure(db, input);
    const verified = await ledger.verify(db, input.agentId);
    if (!verified.valid || !input.contentHash || !Array.isArray(input.coverage)) store.fail('IDENTITY_CHECKPOINT_INVALID');
    const checkpoint = { agentId: input.agentId, headHash: head.head_hash, revision: head.revision,
      contentHash: input.contentHash, coverage: [...new Set(input.coverage)].sort() };
    const prior = await db.get('SELECT * FROM agent_identity_checkpoints WHERE checkpoint_id = ?', input.checkpointId);
    if (prior) {
      if (prior.agent_id !== checkpoint.agentId || prior.content_hash !== checkpoint.contentHash
        || prior.coverage_json !== JSON.stringify(checkpoint.coverage)) store.fail('IDENTITY_CHECKPOINT_CONFLICT');
      return prior;
    }
    await db.run(`INSERT INTO agent_identity_checkpoints
      (checkpoint_id, agent_id, head_hash, revision, content_hash, coverage_json, anchor_kind) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.checkpointId, input.agentId, head.head_hash, head.revision, input.contentHash, JSON.stringify(checkpoint.coverage), input.anchorKind || 'capture');
    return db.get('SELECT * FROM agent_identity_checkpoints WHERE checkpoint_id = ?', input.checkpointId);
  });
}

async function fork(db, input) {
  return withTransaction(db, async () => {
    if (input.parentId === input.childId) store.fail('IDENTITY_FORK_REQUIRES_NEW_INDIVIDUAL');
    const parent = await ledger.ensure(db, { agentId: input.parentId });
    const scope = { organizationId: parent.organization_id, projectId: parent.project_id };
    const child = await ledger.ensure(db, { agentId: input.childId, scope });
    await checkChildOrigin(db, input);
    const checkpoint = await db.get('SELECT * FROM agent_identity_checkpoints WHERE checkpoint_id = ?', input.checkpointId);
    if (!checkpoint || checkpoint.agent_id !== input.parentId) store.fail('IDENTITY_FORK_CHECKPOINT_REQUIRED');
    const payload = { parentId: input.parentId, checkpointId: input.checkpointId,
      sourceHead: checkpoint.head_hash, inheritedExperience: 'inherited', permissionsInherited: false };
    payload.anchorKind = checkpoint.anchor_kind;
    await ledger.append(db, { agentId: child.agent_id, expectedRevision: child.revision,
      type: 'FORK_ORIGIN', operationId: `fork:${input.checkpointId}`, payload, causalRefs: [checkpoint.head_hash] });
    return store.head(db, input.childId);
  });
}

async function checkChildOrigin(db, input) {
  const registration = await store.registration(db, { agentId: input.childId });
  if (registration.parentId !== input.parentId) store.fail('IDENTITY_FORK_PARENT_MISMATCH');
  const prior = await db.get(`SELECT body_json FROM agent_identity_events
    WHERE agent_id = ? AND event_type = 'FORK_ORIGIN'`, input.childId);
  if (prior && JSON.parse(prior.body_json).payload.checkpointId !== input.checkpointId) store.fail('IDENTITY_FORK_ORIGIN_IMMUTABLE');
  const acted = await db.get(`SELECT event_hash FROM agent_identity_events WHERE agent_id = ?
    AND event_type IN ('ACTIVATE', 'DECIDE', 'OUTCOME') LIMIT 1`, input.childId);
  if (acted && !prior) store.fail('IDENTITY_FORK_ALREADY_ACTED');
}

module.exports = { seal, fork };
