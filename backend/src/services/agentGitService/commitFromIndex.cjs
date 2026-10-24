'use strict';

const { getDatabase } = require('../../db');

async function commitFromIndex(req, options = {}) {
  const { getIndex, setHeadRef } = require('./headIndex.cjs');
  const db = await getDatabase();
  const agentId = options.agentId || req.body?.agentId;
  if (!agentId) return { success: false, error: 'agentId is required.' };
  const index = await getIndex(db, req, agentId);
  if (!index) return { success: false, error: 'No staged index found. Stage changes first.' };
  const { collectState, createCommit } = require('./index');
  const currentState = await collectState(db, req, agentId) || {};
  const state = buildStateFromIndex(index, agentId, currentState);
  const stagedSections = Object.keys(JSON.parse(index.index_json).sections);
  const result = await createCommit(req, {
    agentId,
    kind: 'commit',
    refName: options.refName || 'main',
    state,
    metadata: { ...options.metadata, commitFromIndex: true, stagedSections }
  });
  await db.run('DELETE FROM agent_git_indexes WHERE agent_id = ?', agentId);
  await setHeadRef({ db, req }, agentId, options.refName || 'main');
  return { success: true, operation: 'commit-from-index', objectId: result.id, stagedSections };
}

function buildStateFromIndex(index, agentId, currentState = {}) {
  const indexData = JSON.parse(index.index_json);
  const allSections = ['decisions', 'memories', 'runs', 'plasmids', 'permissions', 'events', 'children'];
  const merged = {};
  for (const section of allSections) {
    // Les sections stagées remplacent l'état actuel ; les autres sont conservées.
    merged[section] = indexData.sections && indexData.sections[section] !== undefined
      ? indexData.sections[section]
      : (currentState[section] || []);
  }
  return {
    schema: 'genos.agent-git-state/v1',
    agent: { id: agentId, ...(currentState.agent || {}) },
    ...merged
  };
}

module.exports = commitFromIndex;
