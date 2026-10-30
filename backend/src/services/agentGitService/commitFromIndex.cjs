'use strict';

const { getDatabase } = require('./agentGitDb.cjs');

async function commitFromIndex(req, options = {}) {
  const { getIndex, setHeadRef } = require('./headIndex.cjs');
  const db = await getDatabase();
  const agentId = stagedAgentId(req, options);
  if (!agentId) return { success: false, error: 'agentId is required.' };
  const index = await getIndex(db, req, agentId);
  if (!index) return { success: false, error: 'No staged index found. Stage changes first.' };
  const { collectState, createCommit, getObject } = require('./index');
  const data = JSON.parse(index.index_json);
  const stagedSections = stagedSectionNames(data);
  if (!stagedSections.length) return { success: false, error: 'No sections are staged.' };
  const refName = require('./commitFromIndexValues1.cjs').commitFromIndexValue2({ options, req });
  { const __genosStageResult2 = require('./commitFromIndexStages1.cjs').commitFromIndexStage2({ Number, data, refName }); if (__genosStageResult2) return __genosStageResult2.value; }
  const ref = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  if (require('./commitFromIndexValues1.cjs').commitFromIndexValue1({ Number, data, ref })) {
    return { success: false, error: 'Ref moved since staging; stage again.' };
  }
  const currentState = await collectState(db, req, agentId);
  if (!currentState) return { success: false, error: 'Agent is unavailable in the current tenant.' };
  const parent = data.baseObjectId ? await getObject(db, req, data.baseObjectId) : null;
  if (require('./commitFromIndexValues1.cjs').commitFromIndexValue3({ agentId, data, parent })) {
    return { success: false, error: 'Staged parent is unavailable in the current scope.' };
  }
  { const __genosStageResult1 = require('./commitFromIndexStages1.cjs').commitFromIndexStage1({ parent, require }); if (__genosStageResult1) return __genosStageResult1.value; }
  const baseState = stagedBaseState(parent);
  const state = buildStateFromIndex({ index: { ...index, index_json: JSON.stringify(data) }, agentId: agentId, currentState: currentState, baseState: baseState });
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

function stagedAgentId(req, options) { return options.agentId || req.body?.agentId; }
function stagedSectionNames(data) { return Object.keys(data.sections || {}); }
function stagedBaseState(parent) { return parent ? JSON.parse(parent.state_json) : null; }

function buildStateFromIndex({ index, agentId, currentState = {}, baseState = null } = {}) {
  const indexData = JSON.parse(index.index_json);
  if (currentState.agent?.id !== agentId) throw new Error('Current agent identity mismatch.');
  return require('./stagingPolicy.cjs').buildStagedState(baseState, currentState, indexData.sections || {});
}

module.exports = commitFromIndex;
