'use strict';

const assert = require('node:assert/strict');
const fixture = require('../../benchmarks/identity-continuity/fixture.cjs');
const recognition = require('../src/services/identity/recognitionContext');
const projection = require('../src/services/identity/projection');
const prompt = require('../src/services/identity/prompt');
const origin = require('../src/services/identity/originMemory');

async function familyChecks(db) {
  const read = targetId => recognition.describe(db, { agentId: 'subject', targetId });
  assert.equal((await read('fork-0')).facts.relation, 'child');
  const descendant = await read('descendant-3');
  assert.equal(descendant.facts.relation, 'descendant');
  assert.deepEqual(descendant.facts.path, ['subject', 'fork-0', 'descendant-1', 'descendant-2', 'descendant-3']);
  assert.equal((await recognition.describe(db, { agentId: 'descendant-3', targetId: 'subject' })).facts.relation, 'ancestor');
  assert.equal((await recognition.describe(db, { agentId: 'fork-1', targetId: 'fork-0' })).facts.relation, 'sibling');
  assert.deepEqual((await read('unrelated')).facts.path, []);
  assert.equal((await read('unrelated')).facts.relation, 'unrelated');
  assert.equal((await read('subject')).facts.relation, 'self');
  await assert.rejects(read('outsider'), /SCOPE_MISMATCH/);
  await assert.rejects(read('missing'), /UNREGISTERED/);
  const peers = await projection.peerModels(db, { agentId: 'subject', peerIds: ['descendant-3', 'outsider'] });
  assert.equal(peers[0].causalRecognition.facts.relation, 'descendant');
  assert.equal(peers[1].status, 'unknown');
  assert.match(prompt.format({ agentId: 'subject' }, peers), /cible par rapport à moi: descendant/);
}

async function episodeChecks(db) {
  const own = await fixture.episodes.recordEpisode({ id: 'own', agentId: 'subject' }, db);
  const inherited = await fixture.episodes.recordEpisode({ id: 'copy', agentId: 'fork-0', inheritedFromEpisodeId: own.id,
    situation: { note: 'I personally did this' } }, db);
  const context = await recognition.describe(db, { agentId: 'fork-0', targetId: 'subject', episodeId: inherited.id });
  assert.equal(context.facts.author, 'subject');
  assert.equal(context.facts.ownership, 'inherited');
  assert.equal(context.evidenceHash, fixture.store.hash({ facts: context.facts, evidence: context.evidence }));
  assert.equal((await recognition.describe(db, { agentId: 'subject', targetId: 'fork-0', episodeId: own.id })).facts.ownership, 'personal');
  await assert.rejects(recognition.describe(db, { agentId: 'subject', targetId: 'fork-0', episodeId: inherited.id }), /NOT_OWNED/);
  await db.run("UPDATE autobiographical_episodes SET situation_json = json_set(situation_json, '$._genosExperience.experiencedBy', 'fork-1') WHERE id='copy'");
  await assert.rejects(recognition.describe(db, { agentId: 'fork-0', targetId: 'subject', episodeId: 'copy' }), /AUTHOR_CONFLICT/);
}

async function integrityChecks(db) {
  await db.run("UPDATE agents SET name='same',role='critic',cognitive_revisions=99");
  assert.equal((await recognition.describe(db, { agentId: 'subject', targetId: 'descendant-3' })).facts.relation, 'descendant');
  await db.run("INSERT INTO agents(id, name, role, workspace_id, parent_agent_id) VALUES ('unsealed','same','worker','local','subject')");
  await fixture.ledger.ensure(db, { agentId: 'unsealed' });
  await assert.rejects(recognition.describe(db, { agentId: 'subject', targetId: 'unsealed' }), /UNSEALED_LINEAGE/);
  const peers = await projection.peerModels(db, { agentId: 'subject', peerIds: ['unsealed'] });
  assert.equal(peers[0].causalRecognition.status, 'unknown');
  assert.deepEqual(peers[0].claims, []);
  await assert.rejects(db.run("UPDATE agent_identity_events SET body_json='{}' WHERE agent_id='fork-0' AND event_type='FORK_ORIGIN'"), /IMMUTABLE/);
  await db.run("UPDATE agent_identity_heads SET head_hash='tampered' WHERE agent_id='fork-0'");
  await assert.rejects(recognition.describe(db, { agentId: 'subject', targetId: 'descendant-3' }), /UNVERIFIED/);
}

async function originChecks(db) {
  const token = '012345abcdef';
  const first = await origin.bind(db, { agentId: 'subject', token });
  assert.deepEqual(await origin.bind(db, { agentId: 'subject', token }), first);
  await assert.rejects(origin.bind(db, { agentId: 'subject', token: 'wrong' }), /IDEMPOTENCY_CONFLICT/);
  await origin.inherit(db, { agentId: 'fork-0', sourceId: 'subject' });
  await origin.inherit(db, { agentId: 'descendant-1', sourceId: 'fork-0' });
  assert.equal((await origin.read(db, { agentId: 'descendant-1' })).token, token);
  assert.equal((await origin.check(db, { agentId: 'subject', token: 'bad' })).accepted, false);
  assert.equal((await origin.check(db, { agentId: 'subject', token })).accepted, true);
  await db.run("UPDATE agents SET workspace_id='foreign' WHERE id='subject'");
  await assert.rejects(origin.read(db, { agentId: 'subject' }), /REGISTRATION_CHANGED/);
  await db.run("UPDATE agents SET workspace_id='local' WHERE id='subject'");
  await fixture.ledger.ensure(db, { agentId: 'subject' });
  await assert.rejects(origin.inherit(db, { agentId: 'fork-1', sourceId: 'fork-0' }), /PARENT_MISMATCH/);
  const session = await fixture.activate(db, 'unrelated');
  await assert.rejects(origin.bind(db, { agentId: 'unrelated', token }), /BIND_AFTER_ACTIVATION/);
  await fixture.incarnations.release(db, session);
}

async function main() {
  const db = await fixture.open(':memory:');
  try {
    await fixture.initialize(db, { directForks: 2, descendantDepth: 3 });
    await familyChecks(db);
    await originChecks(db);
    await episodeChecks(db);
    await integrityChecks(db);
    console.log('PASS verified recognition context: ancestry orientation ownership scope unsealed forks and tampering');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
