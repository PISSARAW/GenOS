'use strict';

const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');
const decisions = require('./decisions');

async function describe(db, input) {
  return withTransaction(db, async () => {
    const head = await ledger.ensure(db, input);
    const verified = await ledger.verify(db, input.agentId);
    const origins = await db.all(`SELECT body_json FROM agent_identity_events
      WHERE agent_id = ? AND event_type IN ('GENESIS', 'LEGACY_IMPORT', 'FORK_ORIGIN') ORDER BY revision`, input.agentId);
    return { verified: verified.valid, revision: head.revision, headHash: head.head_hash,
      origin: verified.origin, incarnationId: head.incarnation_id,
      lifeState: head.life_state,
      active: head.lease_until > Date.now(), scope: { organizationId: head.organization_id, projectId: head.project_id },
      origins: origins.map(row => JSON.parse(row.body_json)),
      selfModel: await decisions.selfModel(db, input), consistency: 'causal_registry' };
  });
}

async function peerModels(db, input) {
  const ids = [...new Set(input.peerIds || [])].filter(id => id !== input.agentId).slice(0, 8);
  const models = [];
  for (const peerId of ids) {
    try { models.push(await require('./peers').model(db, { observerId: input.agentId, peerId })); }
    catch (error) { models.push({ peerId, claims: [], status: 'unknown', reason: error.code || 'UNAVAILABLE' }); }
  }
  return models;
}

module.exports = { describe, peerModels };
