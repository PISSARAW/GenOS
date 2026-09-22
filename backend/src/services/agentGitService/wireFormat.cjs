'use strict';

/**
 * Format wire canonical unique (point 3 de l'audit).
 * Le sender (push) et le receiver (receiveRemote/verifyRemoteObject) parlent
 * EXCLUSIVEMENT ce format snake_case. Avant : le sender envoyait le résultat
 * camelCase de storeObject (commitHash, sans stateHash), le vérificateur
 * cherchait commit_hash/tree_hash/state_hash et tombait sur state_hash avec
 * metadata_json '{}' — signature jamais vérifiable sur un vrai flux.
 */
function wireObject(commit) {
  return {
    id: commit.id,
    agent_id: commit.agentId,
    workspace_id: commit.workspaceId,
    ref_name: commit.refName,
    remote_name: commit.remoteName,
    state_hash: commit.stateHash,
    tree_hash: commit.treeHash,
    commit_hash: commit.commitHash,
    parent_commit_ids: commit.parentCommitIds || [],
    signature: commit.signature,
    signature_algorithm: commit.signatureAlgorithm,
    author_key_id: commit.authorKeyId || null,
    public_key_fingerprint: commit.publicKeyFingerprint || null,
    commit_envelope: commit.commitEnvelope || commit.signedCommitEnvelope || null,
    metadata_json: commit.metadataJson || '{}'
  };
}

module.exports = { wireObject };
