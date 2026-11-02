'use strict';

const assert = require('node:assert/strict');
const f = require('./fixture.cjs');
const peers = f.service('identity/peers');
const decisions = f.service('identity/decisions');
const projection = f.service('identity/projection');

async function transform(db, cycle) {
  const before = await f.store.head(db, f.ROOT);
  await db.run(`UPDATE agents SET name=?, role=?, model_tier=?, cognitive_revisions=? WHERE id=?`,
    `renamed-${cycle}`, `specialist-${cycle % 7}`, `model-${cycle % 5}`, cycle + 1, f.ROOT);
  const after = await f.ledger.ensure(db, { agentId: f.ROOT, scope: f.SCOPE });
  assert.equal(after.agent_id, before.agent_id);
  assert.equal(after.revision, before.revision + 1);
  assert.notEqual(after.head_hash, before.head_hash);
  const birth = await db.get('SELECT initial_json FROM agent_identity_births WHERE agent_id=?', f.ROOT);
  assert.equal(JSON.parse(birth.initial_json).name, 'identical-name');
  return { cycle, revision: after.revision, headHash: after.head_hash };
}

function peerIdFor(index, protocol) {
  const offset = index % (protocol.directForks + protocol.descendantDepth + 1);
  if (offset < protocol.directForks) return `fork-${offset}`;
  if (offset < protocol.directForks + protocol.descendantDepth) {
    return `descendant-${offset - protocol.directForks + 1}`;
  }
  return 'unrelated';
}

async function recognize(db, input) {
  const peerId = peerIdFor(input.index, input.protocol);
  const session = await f.activate(db, peerId);
  try {
    const presentation = await peers.present(db, { session, audienceId: f.ROOT });
    const receipt = await peers.recognize(db, { observerId: f.ROOT, presentation,
      operationId: `recognition:${input.index}` });
    assert.equal(receipt.verified, true);
    assert.equal(receipt.peerId, peerId);
    assert.notEqual(receipt.peerId, f.ROOT);
    const model = await peers.model(db, { observerId: f.ROOT, peerId });
    assert.equal(model.claims.find(item => item.key === 'identity').value.agentId, peerId);
    const ancestry = await f.family.getAncestry(db, peerId, 32);
    const isDescendant = ancestry.some(level => level.agentId === f.ROOT);
    assert.equal(isDescendant, peerId !== 'unrelated');
    await verifyForkAnchors(db, ancestry.slice(0, 1));
    return { peerId, isDescendant, ancestryDepth: ancestry.length, peerHead: receipt.peerHead };
  } finally { await f.incarnations.release(db, session); }
}

async function verifyForkAnchors(db, ancestry) {
  for (const level of ancestry.filter(item => item.parents.length > 0)) {
    const description = await projection.describe(db, { agentId: level.agentId });
    assert.equal(description.verified, true);
    const origin = description.origins.find(item => item.type === 'FORK_ORIGIN');
    assert.equal(origin.payload.parentId, level.parents[0]);
    assert.equal(origin.payload.permissionsInherited, false);
    assert.equal(origin.causalRefs[0], origin.payload.sourceHead);
  }
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, pattern);
  return 1;
}

async function adversarial(db, context) {
  const session = await f.activate(db, 'unrelated');
  let rejected = 0;
  try {
    const presentation = await peers.present(db, { session, audienceId: f.ROOT });
    const forged = structuredClone(presentation);
    forged.body.agentId = 'fork-0';
    rejected += await rejects(peers.recognize(db, { observerId: f.ROOT, presentation: forged,
      operationId: `forged:${context.chunk}` }), /PRESENTATION_INVALID/);
    rejected += await rejects(peers.present(db, { session, audienceId: 'outsider' }), /SCOPE/);
    const self = await peers.present(db, { session: context.session, audienceId: f.ROOT });
    rejected += await rejects(peers.recognize(db, { observerId: f.ROOT, presentation: self,
      operationId: `self:${context.chunk}` }), /SELF_IS_NOT_PEER/);
    await peers.recognize(db, { observerId: f.ROOT, presentation,
      operationId: `valid:${context.chunk}` });
    rejected += await rejects(peers.recognize(db, { observerId: f.ROOT, presentation,
      operationId: `replay:${context.chunk}` }), /PRESENTATION_REPLAY/);
    const fresh = await peers.present(db, { session, audienceId: f.ROOT });
    await f.incarnations.release(db, session);
    rejected += await rejects(peers.recognize(db, { observerId: f.ROOT, presentation: fresh,
      operationId: `stale:${context.chunk}` }), /PRESENTATION_STALE/);
  } finally {
    const head = await f.store.head(db, 'unrelated');
    if (head.owner_id) await f.incarnations.release(db, session);
  }
  rejected += await rejects(db.run('UPDATE agents SET id=? WHERE id=?', 'impersonator', f.ROOT), /ID_IMMUTABLE/);
  rejected += await rejects(db.run('UPDATE agent_identity_events SET body_json=? WHERE agent_id=?', '{}', f.ROOT), /EVENT_IMMUTABLE/);
  return rejected;
}

async function inherit(db, chunk) {
  const original = await f.episodes.recordEpisode({ id: `episode:${chunk}`, agentId: f.ROOT,
    missionId: `train:${chunk * 100}`, kind: 'action', lesson: { summary: 'calibration observed' } }, db);
  assert.equal(original.provenance.evidenceClass, 'runtime_attested_decision');
  let source = original;
  for (const agentId of ['fork-0', 'descendant-1', 'descendant-12']) {
    source = await f.episodes.recordEpisode({ agentId, inheritedFromEpisodeId: source.id }, db);
    assert.equal(source.provenance.kind, 'inherited');
    assert.equal(source.provenance.experiencedBy, f.ROOT);
    assert.equal((await decisions.selfModel(db, { agentId })).capabilities.length, 0);
  }
  await assert.rejects(f.episodes.recordEpisode({ agentId: 'outsider',
    inheritedFromEpisodeId: original.id }, db), /SCOPE/);
  return { inherited: 3, crossScopeRejected: 1 };
}

async function verifyAll(db, protocol) {
  const agents = await db.all('SELECT id FROM agents');
  for (const agent of agents) assert.equal((await f.ledger.verify(db, agent.id)).valid, true);
  const descendants = await f.family.getDescendants(db, f.ROOT, 32);
  const expected = Array.from({ length: protocol.directForks }, (_, index) => `fork-${index}`)
    .concat(Array.from({ length: protocol.descendantDepth }, (_, index) => `descendant-${index + 1}`));
  assert.deepEqual(descendants.map(item => item.agentId).sort(), expected.sort());
  return { verifiedAgents: agents.length, descendants: descendants.length,
    root: await f.ledger.verify(db, f.ROOT) };
}

module.exports = { transform, recognize, adversarial, inherit, verifyAll };
