'use strict';

const crypto = require('crypto');
const { treeHash, commitHash } = require('./canonical');

function signingAlgorithm() {
  return process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY ? 'ed25519' : 'hmac-sha256';
}

function signingSecret() {
  const secret = process.env.GENOS_AGENT_GIT_SIGNING_SECRET || process.env.GENOS_GRPC_SHARED_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('GENOS_AGENT_GIT_SIGNING_SECRET or GENOS_GRPC_SHARED_SECRET must be configured in production');
    }
    return 'genos-agent-git-development-secret';
  }
  return secret;
}

function publicKeyFingerprint() {
  if (process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY) {
    return crypto.createHash('sha256').update(process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY).digest('hex').slice(0, 16);
  }
  return null;
}

function authorKeyId() {
  if (process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY) {
    return crypto.createHash('sha256').update(process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY).digest('hex').slice(0, 16);
  }
  return null;
}

function signObject(stateHash, metadata) {
  const payload = Buffer.from(`${stateHash}:${JSON.stringify(metadata || {})}`);
  const isEd25519 = signingAlgorithm() === 'ed25519';
  if (isEd25519) return crypto.sign(null, payload, process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY).toString('base64');
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
}

function buildSignedEnvelope({ id, commitHash: commit, treeHash: tree, agentId, workspaceId, createdAt }) {
  const envelope = {
    v: 1,
    id,
    commitHash: commit,
    treeHash,
    agentId,
    workspaceId,
    createdAt,
    algorithm: signingAlgorithm(),
    authorKeyId: authorKeyId(),
    publicKeyFingerprint: publicKeyFingerprint()
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

// P0 n°4 : l'API canonique est parentCommitIds[] (les merges passent 2 parents).
// Compat : les appelants historiques passent encore parentCommitId (singulier).
function resolveParentIds(opts) {
  if (Array.isArray(opts.parentCommitIds) && opts.parentCommitIds.length) return opts.parentCommitIds;
  if (opts.parentCommitId) return [opts.parentCommitId];
  return [];
}

async function storeObject(db, opts) {
  const { agentId, workspaceId, kind, refName, remoteName, state, createdBy, metadata = {}, locked = false } = opts;
  const parents = resolveParentIds(opts);
  const id = `agent-git-${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const algorithm = signingAlgorithm();
  const tree = treeHash(state);
  const meta = { ...metadata, locked, stateSchema: state.schema, signatureAlgorithm: algorithm };
  // P0 n°2 : le commit_hash couvre tree + parents + metadata ; la signature
  // porte sur commit_hash (et non tree_hash) pour que verifyObjectSignature
  // (authHash = commit_hash || tree_hash || state_hash) soit cohérent.
  const commit = commitHash({ tree, parents, metadata: meta });
  const signature = signObject(commit, meta);
  const createdAt = new Date().toISOString();
  const envelope = buildSignedEnvelope({ id, commitHash: commit, treeHash: tree, agentId, workspaceId, createdAt });
  await db.run(
    `INSERT INTO agent_git_objects (id, agent_id, workspace_id, object_kind, ref_name, remote_name, state_hash, state_json, metadata_json, signature, created_by, parent_commit_id, tree_hash, commit_hash, signature_algorithm, author_key_id, public_key_fingerprint, signed_commit_envelope)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, agentId, workspaceId, kind, refName || null, remoteName || null, crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'), JSON.stringify(state), JSON.stringify(meta), signature, createdBy || 'agent-git', parents[0] || null, tree, commit, algorithm, authorKeyId(), publicKeyFingerprint(), envelope
  );
  for (const [position, parentId] of parents.entries()) {
    await db.run('INSERT OR IGNORE INTO agent_git_commit_parents (commit_id, parent_commit_id, position) VALUES (?, ?, ?)', id, parentId, position);
  }
  return { id, agentId, workspaceId, kind, refName: refName || null, remoteName: remoteName || null, stateHash: crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'), treeHash: tree, commitHash: commit, signature, parentCommitIds: parents, signatureAlgorithm: algorithm, authorKeyId: authorKeyId(), publicKeyFingerprint: publicKeyFingerprint(), signedCommitEnvelope: envelope, metadataJson: JSON.stringify(meta) };
}

module.exports = { storeObject };
