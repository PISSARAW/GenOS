'use strict';

const crypto = require('crypto');

function wireField(incoming, snake, camel) {
  const value = incoming[snake] !== undefined ? incoming[snake] : incoming[camel];
  return value === undefined ? null : value;
}

function signedMetadata(incoming) {
  if (typeof incoming.metadata_json === 'string') return incoming.metadata_json;
  if (incoming.metadata_json && typeof incoming.metadata_json === 'object') {
    return JSON.stringify(incoming.metadata_json);
  }
  return '{}';
}

function remoteRow(ctx) {
  const { req, incoming, state, id, agentId, parents } = ctx;
  return [
    id, agentId, wireField(incoming, 'workspace_id', 'workspaceId'),
    wireField(incoming, 'ref_name', 'refName'), req.body?.remoteName || 'default',
    wireField(incoming, 'state_hash', 'stateHash'), JSON.stringify(state),
    signedMetadata(incoming),
    wireField(incoming, 'signature'), req.user?.username || 'remote', parents[0] || null,
    wireField(incoming, 'tree_hash', 'treeHash'), wireField(incoming, 'commit_hash', 'commitHash'),
    wireField(incoming, 'signature_algorithm', 'signatureAlgorithm'), wireField(incoming, 'author_key_id', 'authorKeyId'),
    wireField(incoming, 'public_key_fingerprint', 'publicKeyFingerprint'),
    wireField(incoming, 'commit_envelope', 'signedCommitEnvelope')
  ];
}

async function persistRemoteObject(db, ctx) {
  const { req, incoming, state } = ctx;
  const agentId = incoming.agent_id || incoming.agentId;
  const id = incoming.id || `agent-git-remote-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const parents = incoming.parent_commit_ids || incoming.parentCommitIds || [];
  const existing = await db.get('SELECT id FROM agent_git_objects WHERE id = ?', id);
  if (existing) return { id, agentId, parentCommitIds: parents, signature: incoming.signature, alreadyPresent: true };
  await db.run(
    `INSERT INTO agent_git_objects (id, agent_id, workspace_id, object_kind, ref_name, remote_name, state_hash, state_json, metadata_json, signature, created_by, parent_commit_id, tree_hash, commit_hash, signature_algorithm, author_key_id, public_key_fingerprint, signed_commit_envelope)
     VALUES (?, ?, ?, 'remote', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...remoteRow({ req, incoming, state, id, agentId, parents })
  );
  await insertRemoteParents(db, id, parents);
  await insertReceiptNote(db, { req, incoming, id, agentId });
  return { id, agentId, parentCommitIds: parents, signature: incoming.signature };
}

async function insertRemoteParents(db, id, parents) {
  for (const [position, parentId] of parents.entries()) {
    await db.run('INSERT OR IGNORE INTO agent_git_commit_parents (commit_id, parent_commit_id, position) VALUES (?, ?, ?)', id, parentId, position);
  }
}

async function insertReceiptNote(db, ctx) {
  const { req, incoming, id, agentId } = ctx;
  const noteId = `agent-note-remote-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const receipt = {
    kind: 'remote-receipt',
    receivedFrom: req.ip || 'remote',
    receivedAt: new Date().toISOString(),
    remoteName: req.body?.remoteName || incoming.remote_name || 'default',
    sourceObjectId: incoming.id || id,
    transport: 'http-push'
  };
  await db.run(
    'INSERT INTO agent_git_notes (id, object_id, agent_id, note_json, created_by) VALUES (?, ?, ?, ?, ?)',
    noteId, id, agentId, JSON.stringify(receipt), req.user?.username || 'remote'
  );
}

module.exports = { persistRemoteObject };
