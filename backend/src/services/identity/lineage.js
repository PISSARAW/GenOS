'use strict';

const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');
const MAX_DEPTH = 128;

function relation(left, right) {
  if (left[0] === right[0]) return 'self';
  if (left[1] === right[0]) return 'parent';
  if (right[1] === left[0]) return 'child';
  if (left.includes(right[0])) return 'ancestor';
  if (right.includes(left[0])) return 'descendant';
  if (left[1] && left[1] === right[1]) return 'sibling';
  return left.some(id => right.includes(id)) ? 'collateral' : 'unrelated';
}

function path(left, right) {
  const common = left.find(id => right.includes(id));
  if (!common) return [];
  return left.slice(0, left.indexOf(common) + 1)
    .concat(right.slice(0, right.indexOf(common)).reverse());
}

async function sealedParent(db, registration) {
  const rows = await db.all(`SELECT body_json FROM agent_identity_events
    WHERE agent_id = ? AND event_type = 'FORK_ORIGIN' ORDER BY revision`, registration.agentId);
  if (rows.length > 1) store.fail('IDENTITY_MULTIPLE_FORK_ORIGINS');
  if (!rows.length) {
    if (registration.parentId) store.fail('IDENTITY_UNSEALED_LINEAGE');
    return null;
  }
  const origin = JSON.parse(rows[0].body_json);
  const checkpoint = await db.get('SELECT * FROM agent_identity_checkpoints WHERE checkpoint_id = ?', origin.payload.checkpointId);
  if (origin.payload.parentId !== registration.parentId || checkpoint?.agent_id !== registration.parentId
    || checkpoint.head_hash !== origin.payload.sourceHead || !origin.causalRefs.includes(checkpoint.head_hash)) {
    store.fail('IDENTITY_FORK_ANCHOR_INVALID');
  }
  return registration.parentId;
}

async function ancestry(db, input) {
  const ids = [], anchors = [];
  let cursor = input.agentId;
  while (cursor) {
    if (ids.includes(cursor) || ids.length >= MAX_DEPTH) store.fail('IDENTITY_LINEAGE_CYCLE_OR_LIMIT');
    const node = await verifiedNode(db, { ...input, agentId: cursor });
    ids.push(cursor);
    anchors.push(node.anchor);
    cursor = node.parentId;
  }
  return { ids, anchors };
}

async function verifiedNode(db, input) {
  if (input.cache.has(input.agentId)) return input.cache.get(input.agentId);
  const registration = await store.registration(db, { agentId: input.agentId, scope: input.scope });
  await ledger.ensure(db, { agentId: input.agentId, scope: input.scope });
  const verified = await ledger.verify(db, input.agentId);
  if (!verified.valid) store.fail('IDENTITY_LINEAGE_UNVERIFIED');
  const node = { anchor: { agentId: input.agentId, headHash: verified.headHash, revision: verified.revision },
    parentId: await sealedParent(db, registration) };
  input.cache.set(input.agentId, node);
  return node;
}

async function describe(db, input) {
  await store.ready(db);
  return withTransaction(db, async () => {
    const registration = await store.registration(db, { agentId: input.agentId });
    const cache = new Map();
    const left = await ancestry(db, { agentId: input.agentId, scope: registration.scope, cache });
    const right = await ancestry(db, { agentId: input.targetId, scope: registration.scope, cache });
    return { actorId: input.agentId, targetId: input.targetId, scope: registration.scope,
      path: path(left.ids, right.ids), relation: relation(left.ids, right.ids),
      anchors: [...new Map([...left.anchors, ...right.anchors].map(row => [row.agentId, row])).values()] };
  });
}

module.exports = { describe };
