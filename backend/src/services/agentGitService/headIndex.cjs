'use strict';

const { getDatabase } = require('./agentGitDb.cjs');
const { treeHash } = require('./canonical');
const { updateRef } = require('./refs');

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

function bodyValue(req, key) {
  if (!req.body) return undefined;
  return req.body[key];
}

function bodyOrDefault(req, key, fallback) {
  const value = bodyValue(req, key);
  if (value) return value;
  return fallback;
}

// --- HEAD management ---

async function getHeadRef(db, req, agentId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT r.* FROM agent_git_refs r LEFT JOIN agents a ON a.id = r.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE r.agent_id = ? AND r.ref_name = 'HEAD' AND ${scope.clause}`, agentId, ...scope.params);
}

async function setHeadRef(ctx, agentId, targetRefName) {
  const { db, req } = ctx;
  const headRef = await getHeadRef(db, req, agentId);
  const currentTarget = headRef?.object_id || null;
  await updateRef({ db, req, agentId, refName: 'HEAD', objectId: targetRefName, options: { action: 'head-move' } });
  return { oldTarget: currentTarget, newTarget: targetRefName };
}

// --- Agent Index (staging area) ---

// The index stores staged sections as a JSON blob keyed by agent_id
// Schema: { agentId, sections: { decisions: [...], memories: [...], ... }, parentCommitId, updatedAt }

async function getIndex(db, req, agentId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT i.* FROM agent_git_indexes i LEFT JOIN agents a ON a.id = i.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE i.agent_id = ? AND ${scope.clause}`, agentId, ...scope.params);
}

async function createOrUpdateIndex(ctx, agentId, indexData) {
  const { db, req } = ctx;
  const scope = scopeSql(req, 'w');
  const existing = await getIndex(db, req, agentId);
  const indexJson = JSON.stringify(indexData);
  if (existing) {
    await db.run(`UPDATE agent_git_indexes SET index_json = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`, indexJson, agentId);
  } else {
    await db.run(`INSERT INTO agent_git_indexes (id, agent_id, index_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, `idx-${agentId}-${Date.now()}`, agentId, indexJson);
  }
}

async function stage(ctx) {
  const { db, req, agentId, section } = ctx;
  const items = ctx.items || [];
  if (!agentId || !section) return { success: false, error: 'agentId and section are required.' };
  const indexData = await loadIndexData(db, req, agentId);
  if (Object.keys(indexData.sections || {}).length &&
    (indexData.refName !== ctx.refName || indexData.baseObjectId !== ctx.baseObjectId ||
      indexData.baseRefVersion !== ctx.baseRefVersion)) {
    return { success: false, error: 'Staged base moved; unstage and stage again.' };
  }
  indexData.refName = ctx.refName;
  indexData.baseObjectId = ctx.baseObjectId;
  indexData.baseRefVersion = ctx.baseRefVersion;
  indexData.sections[section] = items;
  indexData.updatedAt = new Date().toISOString();
  await saveIndexData(ctx, agentId, indexData);
  return { success: true, operation: 'stage', agentId, section, stagedCount: Array.isArray(items) ? items.length : 1 };
}

async function unstage(ctx) {
  const { db, req, agentId, section } = ctx;
  if (!agentId || !section) return { success: false, error: 'agentId and section are required.' };
  const existing = await getIndex(db, req, agentId);
  if (!existing) return { success: false, error: 'No index found for agent.' };
  const indexData = JSON.parse(existing.index_json);
  delete indexData.sections[section];
  indexData.updatedAt = new Date().toISOString();
  await saveIndexData(ctx, agentId, indexData);
  return { success: true, operation: 'unstage', agentId, section };
}

async function loadIndexData(db, req, agentId) {
  const existing = await getIndex(db, req, agentId);
  return existing ? JSON.parse(existing.index_json) : { agentId, sections: {} };
}

async function saveIndexData(ctx, agentId, indexData) {
  const { db, req } = ctx;
  const indexJson = JSON.stringify(indexData);
  const existing = await getIndex(db, req, agentId);
  if (existing) {
    await db.run('UPDATE agent_git_indexes SET index_json = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?', indexJson, agentId);
  } else {
    await db.run('INSERT INTO agent_git_indexes (id, agent_id, index_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', `idx-${agentId}-${Date.now()}`, agentId, indexJson);
  }
}

function computeStagedSections(indexData) {
  const stagedSections = Object.keys(indexData.sections || {});
  const stagedCount = stagedSections.reduce((sum, s) => sum +
    (Array.isArray(indexData.sections[s]) ? indexData.sections[s].length : 1), 0);
  return { stagedSections, stagedCount };
}

async function status(req) {
  const db = await getDatabase();
  const agentId = bodyValue(req, 'agentId');
  if (!agentId) return { success: false, error: 'agentId is required.' };
  const head = await getHeadRef(db, req, agentId);
  const index = await getIndex(db, req, agentId);
  const indexData = index ? JSON.parse(index.index_json) : { sections: {} };
  const { stagedSections, stagedCount } = computeStagedSections(indexData);
  const { collectState, getObject } = require('./index');
  const current = await collectState(db, req, agentId);
  if (!current) return { success: false, error: 'Agent is unavailable in the current tenant.' };
  const refName = indexData.refName || bodyOrDefault(req, 'refName', 'main');
  const ref = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  const baseId = Object.hasOwn(indexData, 'baseObjectId') ? indexData.baseObjectId : ref?.object_id;
  const base = baseId ? await getObject(db, req, baseId) : null;
  const baseState = base ? JSON.parse(base.state_json) : null;
  const unstaged = require('./stagingPolicy.cjs').unstagedSections(baseState, current, indexData.sections || {});
  return require('./headIndexValues1.cjs').statusValue1({ Array, Number, agentId, head, index, get indexData() { return indexData; }, ref, stagedCount, stagedSections, unstaged });
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

async function commitFromIndex(req, options = {}) {
  const db = await getDatabase();
  const agentId = options.agentId || bodyValue(req, 'agentId');
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

module.exports = { getHeadRef, setHeadRef, getIndex, stage, unstage, status };
