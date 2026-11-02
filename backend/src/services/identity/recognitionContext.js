'use strict';

const { withTransaction } = require('../../db');
const store = require('./storage');
const lineage = require('./lineage');
const experience = require('./experience');

async function inheritedSource(db, input) {
  const row = await db.get('SELECT * FROM autobiographical_episodes WHERE id = ?', input.provenance.sourceEpisodeId);
  if (!row || row.agent_id === input.agentId) store.fail('IDENTITY_EPISODE_SOURCE_INVALID');
  await store.registration(db, { agentId: row.agent_id, scope: input.scope });
  if (experience.read(row).experiencedBy !== input.provenance.experiencedBy) store.fail('IDENTITY_EPISODE_AUTHOR_CONFLICT');
}

async function episodeFacts(db, input) {
  if (!input.episodeId) return { author: null, ownership: 'other', episodeId: null };
  const row = await db.get('SELECT * FROM autobiographical_episodes WHERE id = ? AND agent_id = ?', input.episodeId, input.agentId);
  if (!row) store.fail('IDENTITY_EPISODE_NOT_OWNED');
  const provenance = experience.read(row);
  if (provenance.recordedFor !== input.agentId) store.fail('IDENTITY_EPISODE_OWNER_CONFLICT');
  if (!provenance.experiencedBy) return { author: null, ownership: 'other', episodeId: row.id };
  await store.registration(db, { agentId: provenance.experiencedBy, scope: input.scope });
  if (provenance.kind === 'inherited') {
    await inheritedSource(db, { ...input, provenance });
    return { author: provenance.experiencedBy, ownership: 'inherited', episodeId: row.id };
  }
  if (provenance.experiencedBy !== input.agentId) store.fail('IDENTITY_EPISODE_AUTHOR_CONFLICT');
  return { author: provenance.experiencedBy, ownership: 'personal', episodeId: row.id };
}

async function describe(db, input) {
  await store.ready(db);
  return withTransaction(db, async () => {
    const family = await lineage.describe(db, input);
    const episode = await episodeFacts(db, { ...input, scope: family.scope });
    const facts = { self: input.agentId, target: input.targetId, path: family.path,
      relation: family.relation, author: episode.author, ownership: episode.ownership };
    const evidence = { version: 'causal-recognition-v1', scope: family.scope,
      anchors: family.anchors, episodeId: episode.episodeId };
    return { facts, evidence, evidenceHash: store.hash({ facts, evidence }) };
  });
}

module.exports = { describe };
