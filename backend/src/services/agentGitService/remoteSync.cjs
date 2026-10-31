'use strict';

const { withTransaction } = require('./agentGitDb.cjs');
const { getCommit, collectAncestors } = require('./commitGraph');
const { verifySource } = require('./verifiedMerge.cjs');
const { verifyRemoteObject } = require('./remoteVerification.cjs');
const { persistRemoteObject } = require('./remotePersist.cjs');
const { updateRef } = require('./refs');
const { treeHash, commitHash } = require('./canonical');

function trackingName(remoteName, refName) {
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(remoteName) || !/^[a-zA-Z0-9._/-]{1,128}$/.test(refName)
    || refName.includes('..') || refName.startsWith('/')) throw new Error('Invalid remote or ref name.');
  return `refs/remotes/${remoteName}/${refName}`;
}

function wire(row) {
  return { id: row.id, agent_id: row.agent_id, workspace_id: row.workspace_id,
    ref_name: row.ref_name, state_hash: row.state_hash, tree_hash: row.tree_hash,
    commit_hash: row.commit_hash, parent_commit_ids: row.parentIds,
    signature: row.signature, signature_algorithm: row.signature_algorithm,
    author_key_id: row.author_key_id, public_key_fingerprint: row.public_key_fingerprint,
    commit_envelope: row.signed_commit_envelope, metadata_json: row.metadata_json };
}

async function exportHistory({ db, req, agentId, refName }) {
  const { loadAgent } = require('./index');
  const agent = await loadAgent(db, req, agentId);
  if (!agent) throw new Error('Agent is unavailable in the current tenant.');
  const ref = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  if (!ref?.object_id) throw new Error('Requested ref has no commit.');
  const visited = new Set();
  const active = new Set();
  const ordered = [];
  async function visit(id) {
    if (active.has(id)) throw new Error('Remote history contains a cycle.');
    if (visited.has(id)) return;
    if (visited.size >= 256) throw new Error('Remote history exceeds 256 objects.');
    const row = await getCommit(db, id);
    if (require('./remoteSyncValues1.cjs').exportHistoryValue4({ agent, agentId, row })) {
      throw new Error('Remote history crosses its agent or workspace scope.');
    }
    active.add(id);
    for (const parent of row.parentIds) await visit(parent);
    active.delete(id);
    visited.add(id);
    const state = JSON.parse(row.state_json);
    const metadata = JSON.parse(row.metadata_json || '{}');
    require('./remoteSyncStages1.cjs').exportHistoryStage2({ Error, commitHash, metadata, row, state, treeHash, verifySource });
    ordered.push({ object: wire(row), state });
  }
  await visit(ref.object_id);
  if (Buffer.byteLength(JSON.stringify(ordered)) > 20_000_000) throw new Error('Remote history exceeds 20 MB.');
  return { schema: 'genos.agentgit-history/v1', agentId, refName,
    headObjectId: ref.object_id, history: ordered };
}

async function isAncestor(db, ancestorId, headId) {
  if (!ancestorId) return true;
  return (await collectAncestors(db, headId)).some((item) => item.id === ancestorId);
}

async function divergence(db, localId, trackedId) {
  if (!localId || !trackedId) return { ahead: null, behind: null, known: false };
  const [local, tracked] = await Promise.all([collectAncestors(db, localId), collectAncestors(db, trackedId)]);
  const localIds = new Set(local.map((item) => item.id));
  const remoteIds = new Set(tracked.map((item) => item.id));
  return { ahead: [...localIds].filter((id) => !remoteIds.has(id)).length,
    behind: [...remoteIds].filter((id) => !localIds.has(id)).length, known: true };
}

async function importHistory(db, req, packageData) {
  const { agentId, refName, headObjectId, history } = packageData || {};
  if (require('./remoteSyncValues1.cjs').importHistoryValue1({ Array, agentId, headObjectId, history, packageData, refName })) {
    throw new Error('A complete bounded AgentGit history package is required.');
  }
  if (Buffer.byteLength(JSON.stringify(packageData)) > 20_000_000 ||
    new Set(history.map((entry) => entry?.object?.id)).size !== history.length) {
    throw new Error('Remote history is too large or contains duplicate objects.');
  }
  const remoteName = req.body?.remoteName || 'default';
  const trackingRef = trackingName(remoteName, refName);
  const { loadAgent } = require('./index');
  const agent = await loadAgent(db, req, agentId);
  if (!agent) throw new Error('Remote agent is unavailable in the current tenant.');
  return withTransaction(db, async () => {
    const prior = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, trackingRef);
    for (const entry of history) await importEntry({ db, req, entry, agent });
    const fastForward = await isAncestor(db, prior?.object_id, headObjectId);
    const leaseMatches = require('./remoteSyncValues1.cjs').importHistoryValue5({ prior, req });
    const observedRewind = req.body?.importMode === 'fetch';
    if (require('./remoteSyncValues1.cjs').importHistoryValue2({ fastForward, leaseMatches, observedRewind })) throw new Error('Remote tracking ref diverged; fetch and merge first.');
    await updateRef({ db, req, agentId, refName: trackingRef, objectId: headObjectId,
      options: { action: 'remote-import', inTransaction: true } });
    return require('./remoteSyncValues1.cjs').importHistoryValue6({ fastForward, headObjectId, history, leaseMatches, observedRewind, trackingRef });
  });
}

async function importEntry(ctx) {
  const { db, req, agent } = ctx;
  const { object, state } = ctx.entry || {};
  if (object?.agent_id !== agent.id || object.workspace_id !== agent.workspace_id) {
    throw new Error('Remote object crosses its agent or workspace scope.');
  }
  if (!Array.isArray(object.parent_commit_ids) || object.parent_commit_ids.length > 2) {
    throw new Error('Remote object parent list is invalid.');
  }
  const verification = await verifyRemoteObject(object, state, { db, tenantId: req.tenant?.organizationId || null });
  if (!verification.valid) throw new Error(verification.error);
  const existing = await db.get('SELECT state_hash, commit_hash FROM agent_git_objects WHERE id = ?', object.id);
  if (require('./remoteSyncValues1.cjs').importEntryValue3({ existing, object })) {
    throw new Error('Existing remote object ID has different content.');
  }
  await require('./remoteSyncStages1.cjs').importEntryStage1({ Error, db, object });
  if (!existing) await persistRemoteObject(db, { req, incoming: object, state });
}

module.exports = { trackingName, exportHistory, importHistory, divergence, isAncestor };
