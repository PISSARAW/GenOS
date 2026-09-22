'use strict';

const { getCommit, findMergeBase: findBase } = require('./commitGraph');
const {
  replaceAgentState,
  replaceDecisionState,
  replaceMemoryState,
  replaceRunState,
  replacePlasmidState,
  replacePermissionState
} = require('./replaceStateHelpers.cjs');

function bodyValue(req, key) {
  if (!req.body) return undefined;
  return req.body[key];
}

async function mergeBase(req) {
  const db = await require('../../db').getDatabase();
  const leftId = bodyValue(req, 'leftObjectId');
  const rightId = bodyValue(req, 'rightObjectId');
  if (!leftId || !rightId) return { success: false, error: 'Both leftObjectId and rightObjectId are required.' };
  const left = await getCommit(db, leftId);
  const right = await getCommit(db, rightId);
  if (!left || !right) return { success: false, error: 'Commit not found.' };
  const base = await findBase(db, leftId, rightId);
  return { success: true, operation: 'merge-base', mergeBaseObjectId: base?.id || null, leftCommitId: leftId, rightCommitId: rightId };
}

async function reset(req) {
  const db = await require('../../db').getDatabase();
  const objectId = bodyValue(req, 'objectId');
  const mode = bodyValue(req, 'mode') || 'mixed';
  if (!['soft', 'mixed', 'hard'].includes(mode)) return { success: false, error: 'Mode must be soft, mixed, or hard.' };
  const obj = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', objectId);
  if (!obj) return { success: false, error: 'Commit object not found.' };
  const refName = bodyValue(req, 'refName') || obj.ref_name || 'main';
  const agentId = obj.agent_id;

  await db.run('UPDATE agent_git_refs SET object_id = ? WHERE agent_id = ? AND ref_name = ?', objectId, agentId, refName);

  if (mode === 'mixed' || mode === 'hard') {
    await db.run('DELETE FROM agent_git_indexes WHERE agent_id = ?', agentId);
  }

  if (mode === 'hard') {
    const state = JSON.parse(obj.state_json);
    await replaceState(req, { targetAgentId: agentId, state, sections: ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions'] });
  }

  return { success: true, operation: 'reset', mode, objectId, agentId, refName };
}

async function loadAgentForDag(db, req, agentId) {
  const scope = req.tenant ? 'AND w.organization_id = ? AND w.project_id = ?' : '';
  const params = req.tenant ? [agentId, req.tenant.organizationId, req.tenant.projectId] : [agentId];
  return db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? ${scope}`, ...params);
}

async function replaceState(req, { targetAgentId, state, sections }) {
  const db = await require('../../db').getDatabase();
  const target = await loadAgentForDag(db, req, targetAgentId);
  if (!target) throw Object.assign(new Error('Target agent not available.'), { code: 'AGENT_NOT_FOUND' });
  const ctx = { db, req, targetAgentId };
  const selected = new Set(sections || ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']);

  await db.exec('BEGIN IMMEDIATE');
  try {
    if (selected.has('agent')) await replaceAgentState(ctx, targetAgentId, state.agent);
    if (selected.has('decisions')) await replaceDecisionState(ctx, targetAgentId, state.decisions);
    if (selected.has('memories')) await replaceMemoryState(ctx, targetAgentId, state.memories);
    if (selected.has('runs')) await replaceRunState(ctx, targetAgentId, state.runs);
    if (selected.has('plasmids')) await replacePlasmidState(ctx, targetAgentId, state.plasmids);
    if (selected.has('permissions')) await replacePermissionState(ctx, targetAgentId, state.permissions);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
  return { targetAgentId, sections: [...selected] };
}

function computePatch(fromState, toState) {
  const operations = [];
  const sections = ['decisions', 'memories', 'runs', 'plasmids', 'permissions'];
  for (const section of sections) {
    computeSectionPatch({ fromState, toState, section, operations });
  }
  return { operations };
}

function computeSectionPatch(ctx) {
  const { fromState, toState, section, operations } = ctx;
  const fromItems = fromState[section] || [];
  const toItems = toState[section] || [];
  const idResolver = section === 'plasmids' ? 'plasmid_id' : 'id';
  const fromMap = buildIdMap(fromItems, idResolver);
  const toMap = buildIdMap(toItems, idResolver);
  computeAddedOrReplaced({ toItems, fromMap, operations, section, idResolver });
  computeRemoved({ fromItems, toMap, operations, section, idResolver });
}

function computeAddedOrReplaced(ctx) {
  const { toItems, fromMap, operations, section, idResolver } = ctx;
  for (const item of toItems) {
    const id = item[idResolver];
    if (id === undefined || !fromMap.has(id)) {
      operations.push({ op: 'ADD', section, item });
    } else if (JSON.stringify(fromMap.get(id)) !== JSON.stringify(item)) {
      operations.push({ op: 'REPLACE', section, itemId: id, item });
    }
  }
}

function computeRemoved(ctx) {
  const { fromItems, toMap, operations, section, idResolver } = ctx;
  for (const item of fromItems) {
    const id = item[idResolver];
    if (id !== undefined && !toMap.has(id)) {
      operations.push({ op: 'REMOVE', section, itemId: id });
    }
  }
}

function buildIdMap(items, idResolver) {
  const map = new Map();
  for (const item of items) {
    const id = item[idResolver];
    if (id !== undefined) map.set(id, item);
  }
  return map;
}

async function applyPatch(req, { targetAgentId, patch, sections }) {
  const db = await require('../../db').getDatabase();
  const { collectState } = require('./index');
  const current = await collectState(db, req, targetAgentId);
  const newState = { ...current };
  for (const operation of patch.operations || []) {
    if (!sections || sections.includes(operation.section)) {
      if (operation.op === 'ADD') {
        newState[operation.section] = [...(newState[operation.section] || []), operation.item];
      } else if (operation.op === 'REMOVE') {
        newState[operation.section] = (newState[operation.section] || []).filter(i => i.id !== operation.itemId);
      }
    }
  }
  return replaceState(req, { targetAgentId, state: newState, sections: sections || ['decisions', 'memories', 'runs', 'plasmids', 'permissions'] });
}

module.exports = { mergeBase, reset, replaceState, computePatch, applyPatch };
