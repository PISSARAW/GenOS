'use strict';

/**
 * Persistance d'un objet remote reçu (bug audit #6).
 * Stocke l'objet TEL QUEL — id, signature, hashes du sender — au lieu d'un
 * storeObject qui re-signe et perd les parents. La provenance (signature du
 * sender) reste vérifiable après réception.
 */

const crypto = require('crypto');

// Lecture d'un champ wire avec compat camelCase (le wire canonical est
// snake_case ; les anciens senders pouvaient envoyer du camelCase).
function wireField(incoming, snake, camel) {
  const value = incoming[snake] !== undefined ? incoming[snake] : incoming[camel];
  return value === undefined ? null : value;
}

function remoteRow(ctx) {
  const { req, incoming, state, id, agentId, parents } = ctx;
  return [
    id, agentId, wireField(incoming, 'workspace_id', 'workspaceId'),
    wireField(incoming, 'ref_name', 'refName'), req.body?.remoteName || 'default',
    wireField(incoming, 'state_hash', 'stateHash'), JSON.stringify(state),
    JSON.stringify({ receivedFrom: req.ip || 'remote', sourceObjectId: incoming.id, metadataJson: incoming.metadata_json || '{}' }),
    wireField(incoming, 'signature'), req.user?.username || 'remote', parents[0] || null,
    wireField(incoming, 'tree_hash', 'treeHash'), wireField(incoming, 'commit_hash', 'commitHash'),
    wireField(incoming, 'signature_algorithm', 'signatureAlgorithm'), wireField(incoming, 'author_key_id', 'authorKeyId'),
    wireField(incoming, 'public_key_fingerprint', 'publicKeyFingerprint'),
    wireField(incoming, 'commit_envelope', 'signedCommitEnvelope')
  ];
}

async function persistRemoteObject(db, { req, incoming, state }) {
  const agentId = incoming.agent_id || incoming.agentId;
  const id = incoming.id || `agent-git-remote-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const parents = incoming.parent_commit_ids || incoming.parentCommitIds || [];
  // Idempotent : un re-push du même objet remote ne doit pas échouer —
  // l'objet existant (déjà vérifié) est conservé tel quel.
  const existing = await db.get('SELECT id FROM agent_git_objects WHERE id = ?', id);
  if (existing) return { id, agentId, parentCommitIds: parents, signature: incoming.signature, alreadyPresent: true };
  await db.run(
    `INSERT INTO agent_git_objects (id, agent_id, workspace_id, object_kind, ref_name, remote_name, state_hash, state_json, metadata_json, signature, created_by, parent_commit_id, tree_hash, commit_hash, signature_algorithm, author_key_id, public_key_fingerprint, signed_commit_envelope)
     VALUES (?, ?, ?, 'remote', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...remoteRow({ req, incoming, state, id, agentId, parents })
  );
  await insertRemoteParents(db, id, parents);
  return { id, agentId, parentCommitIds: parents, signature: incoming.signature };
}

async function insertRemoteParents(db, id, parents) {
  for (const [position, parentId] of parents.entries()) {
    await db.run('INSERT OR IGNORE INTO agent_git_commit_parents (commit_id, parent_commit_id, position) VALUES (?, ?, ?)', id, parentId, position);
  }
}

module.exports = { persistRemoteObject };
