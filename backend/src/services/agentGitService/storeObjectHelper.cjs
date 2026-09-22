'use strict';

const crypto = require('crypto');
const { treeHash, commitHash } = require('./canonical');

function signObject(stateHash, metadata) {
  const payload = Buffer.from(`${stateHash}:${JSON.stringify(metadata || {})}`);
  const isEd25519 = !!process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY;
  if (isEd25519) return crypto.sign(null, payload, process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY).toString('base64');
  const secret = process.env.GENOS_AGENT_GIT_SIGNING_SECRET || process.env.GENOS_GRPC_SHARED_SECRET || 'genos-agent-git-development-secret';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function storeObject(db, opts) {
  const { agentId, workspaceId, kind, refName, remoteName, state, createdBy, metadata = {}, locked = false, parentCommitId = null } = opts;
  const id = `agent-git-${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const algorithm = !!process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY ? 'ed25519' : 'hmac-sha256';
  const tree = treeHash(state);
  const meta = { ...metadata, locked, stateSchema: state.schema, signatureAlgorithm: algorithm };
  const signature = signObject(tree, meta);
  const commit = commitHash({ tree, parents: parentCommitId ? [parentCommitId] : [], metadata: meta });
  await db.run(
    `INSERT INTO agent_git_objects (id, agent_id, workspace_id, object_kind, ref_name, remote_name, state_hash, state_json, metadata_json, signature, created_by, parent_commit_id, tree_hash, commit_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, agentId, workspaceId, kind, refName || null, remoteName || null, crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'), JSON.stringify(state), JSON.stringify(meta), signature, createdBy || 'agent-git', parentCommitId, tree, commit
  );
  if (parentCommitId) await db.run('INSERT OR IGNORE INTO agent_git_commit_parents (commit_id, parent_commit_id) VALUES (?, ?)', id, parentCommitId);
  return { id, agentId, workspaceId, kind, refName: refName || null, remoteName: remoteName || null, treeHash: tree, commitHash: commit, signature, parentCommitId };
}

module.exports = { storeObject };
