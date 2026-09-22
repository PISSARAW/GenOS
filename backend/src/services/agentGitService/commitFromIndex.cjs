'use strict';

const { getDatabase } = require('../../db');

async function commitFromIndex(req, options = {}) {
  const { getIndex, setHeadRef } = require('./headIndex.cjs');
  const db = await getDatabase();
  const agentId = options.agentId || req.body?.agentId;
  if (!agentId) return { success: false, error: 'agentId is required.' };
  const index = await getIndex(db, req, agentId);
  if (!index) return { success: false, error: 'No staged index found. Stage changes first.' };
  const state = buildStateFromIndex(index, agentId);
  const { createCommit } = require('./index');
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

function buildStateFromIndex(index, agentId) {
  const indexData = JSON.parse(index.index_json);
  return {
    schema: 'genos.agent-git-state/v1',
    agent: { id: agentId },
    decisions: indexData.sections.decisions || [],
    memories: indexData.sections.memories || [],
    runs: indexData.sections.runs || [],
    plasmids: indexData.sections.plasmids || [],
    permissions: indexData.sections.permissions || [],
    events: indexData.sections.events || [],
    children: indexData.sections.children || []
  };
}

module.exports = commitFromIndex;
