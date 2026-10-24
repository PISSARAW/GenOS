'use strict';

const { getDatabase } = require('./agentGitDb.cjs');

async function commitFromIndex(req, options = {}) {
  const { getIndex, setHeadRef } = require('./headIndex.cjs');
  const db = await getDatabase();
  const agentId = options.agentId || req.body?.agentId;
  if (!agentId) return { success: false, error: 'agentId is required.' };
  const index = await getIndex(db, req, agentId);
  if (!index) return { success: false, error: 'No staged index found. Stage changes first.' };
  const { collectState, createCommit, getObject } = require('./index');
  const data = JSON.parse(index.index_json);
  const stagedSections = Object.keys(data.sections || {});
  if (!stagedSections.length) return { success: false, error: 'No sections are staged.' };
  const refName = options.refName || req.body?.refName || 'main';
  if (data.refName !== refName || !Number.isSafeInteger(data.baseRefVersion)) {
    return { success: false, error: 'Index base is missing or belongs to another ref; stage again.' };
  }
  const ref = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  if ((ref?.object_id || null) !== data.baseObjectId || Number(ref?.version || 0) !== data.baseRefVersion) {
    return { success: false, error: 'Ref moved since staging; stage again.' };
  }
  const currentState = await collectState(db, req, agentId);
  if (!currentState) return { success: false, error: 'Agent is unavailable in the current tenant.' };
  const parent = data.baseObjectId ? await getObject(db, req, data.baseObjectId) : null;
  if (data.baseObjectId && (!parent || parent.agent_id !== agentId)) {
    return { success: false, error: 'Staged parent is unavailable in the current scope.' };
  }
  if (parent && require('./verifiedMerge.cjs').verifySource(parent).length) {
    return { success: false, error: 'Staged parent failed integrity verification.' };
  }
  const baseState = parent ? JSON.parse(parent.state_json) : null;
  const state = buildStateFromIndex({ ...index, index_json: JSON.stringify(data) }, agentId, currentState, baseState);
  const result = await createCommit(req, {
    agentId,
    kind: 'commit',
    refName,
    state,
    expectedVersion: data.baseRefVersion,
    metadata: { ...options.metadata, commitFromIndex: true, stagedSections }
  });
  await db.run('DELETE FROM agent_git_indexes WHERE agent_id = ?', agentId);
  await setHeadRef({ db, req }, agentId, refName);
  return { success: true, operation: 'commit-from-index', objectId: result.id, stagedSections };
}

function buildStateFromIndex(index, agentId, currentState = {}, baseState = null) {
  const indexData = JSON.parse(index.index_json);
  if (currentState.agent?.id !== agentId) throw new Error('Current agent identity mismatch.');
  return require('./stagingPolicy.cjs').buildStagedState(baseState, currentState, indexData.sections || {});
}

module.exports = commitFromIndex;
