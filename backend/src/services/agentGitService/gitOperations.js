'use strict';

const { getCommit, findMergeBase, collectAncestors } = require('./commitGraph');
const { computePatch, applyPatch, replaceState, applyOperationToState } = require('./dagOperations');
const { storeObject } = require('./storeObjectHelper.cjs');
const { updateRef } = require('./refs');
const { enforceHooks } = require('./hooks');
const { mergeArraySection } = require('./mergeHelpers.cjs');
const { mergeEvents, mergeChildren } = require('./mergeDrivers.cjs');
const { getDatabase } = require('../../db');

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

async function getObjectScoped(db, req, objectId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

function emptyState() {
  return { decisions: [], memories: [], runs: [], plasmids: [], permissions: [] };
}

function collectDeniedTools(permissions) {
  const denied = new Set();
  for (const p of permissions) {
    const items = JSON.parse(p.denied_tools_json || '[]');
    for (const d of items) denied.add(d);
  }
  return denied;
}

// --- Cherry-Pick ---

async function cherryPick(req) {
  const db = await getDatabase();
  const object = await getObjectScoped(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };

  const commit = await getCommit(db, object.id);
  const patch = await buildCherryPickPatch({ db, req, commit, object });
  const sections = req.body?.sections || ['decisions', 'memories', 'plasmids', 'permissions'];
  const targetAgentId = req.body?.targetAgentId || object.agent_id;
  const result = await applyPatch(req, { targetAgentId, patch, sections });

  // Point 5 : le commit doit capturer l'état RÉSULTANT du cherry-pick
  // (target + patch), pas l'état source du commit d'origine.
  const resultingState = await collectStateScoped(db, req, targetAgentId);
  const commitResult = await storeObject(db, {
    agentId: targetAgentId,
    workspaceId: object.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'main',
    state: resultingState,
    createdBy: req.user?.username || 'agent-git',
    metadata: { cherryPickedFrom: object.id, cherryPicked: true, patchOpCount: patch.operations.length }
  });

  await updateRef({ db, req, agentId: targetAgentId, refName: req.body?.refName || 'main', objectId: commitResult.id, options: { action: 'cherry-pick' } });
  return { success: true, operation: 'cherry-pick', objectId: object.id, ...result, ...commitResult };
}

async function collectStateScoped(db, req, agentId) {
  const { collectState } = require('./index');
  const state = await collectState(db, req, agentId);
  if (state) return state;
  throw Object.assign(new Error('Target agent not available.'), { code: 'AGENT_NOT_FOUND' });
}

async function buildCherryPickPatch(ctx) {
  const { db, req, commit, object } = ctx;
  if (commit.parentIds && commit.parentIds.length > 0) {
    const parentObj = await getObjectScoped(db, req, commit.parentIds[0]);
    if (parentObj) {
      return computePatch(JSON.parse(parentObj.state_json), JSON.parse(object.state_json));
    }
  }
  return computePatch(emptyState(), JSON.parse(object.state_json));
}

// --- Merge ---

async function merge(req) {
  const db = await getDatabase();
  const ids = resolveMergeIds(req);
  if (!ids.ok) return ids.error;
  const sides = await loadMergeSides({ db, req, ids });
  if (!sides.ok) return sides.error;
  const base = await findMergeBase(db, ids.leftId, ids.rightId);
  const merged = buildMergedState({ base, left: sides.left, right: sides.right, nameOverride: req.body?.name });
  const conflict = checkMergeConflicts({ merged, base, ids });
  if (conflict) return conflict;
  return commitMergedState({ db, req, sides, base, merged, ids });
}

function resolveMergeIds(req) {
  const leftId = req.body?.leftObjectId || req.body?.leftId;
  const rightId = req.body?.rightObjectId || req.body?.rightId;
  if (!leftId || !rightId) return { ok: false, error: { success: false, error: 'Both leftObjectId and rightObjectId are required.' } };
  return { ok: true, leftId, rightId };
}

async function loadMergeSides(ctx) {
  const { db, req, ids } = ctx;
  const left = await getObjectScoped(db, req, ids.leftId);
  const right = await getObjectScoped(db, req, ids.rightId);
  if (!left || !right) return { ok: false, error: { success: false, error: 'Both commits must exist.' } };
  return { ok: true, left, right };
}

function checkMergeConflicts(ctx) {
  const { merged, base, ids } = ctx;
  if (merged.conflicts && merged.conflicts.length > 0) {
    return { success: false, operation: 'merge', conflicts: merged.conflicts, mergeBase: base?.id || null, leftCommitId: ids.leftId, rightCommitId: ids.rightId, error: 'Merge conflicts require explicit resolution.' };
  }
  return null;
}

async function commitMergedState(ctx) {
  const { db, req, sides, base, merged, ids } = ctx;
  const targetAgentId = req.body?.targetAgentId || sides.left.agent_id;
  await enforceHooks({ db, agentId: targetAgentId, hookName: 'merge-validation', context: merged.storeState });
  const result = await replaceState(req, {
    targetAgentId,
    state: merged.storeState,
    sections: ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']
  });
  const commitResult = await createMergeCommit({ db, req, left: sides.left, base, merged, leftId: ids.leftId, rightId: ids.rightId });
  return { success: true, operation: 'merge', ...result, ...commitResult, mergeBase: base?.id || null, leftCommitId: ids.leftId, rightCommitId: ids.rightId };
}

function buildMergedState(ctx) {
  const { base, left, right, nameOverride } = ctx;
  const baseState = base ? JSON.parse(base.state_json) : emptyState();
  const leftState = JSON.parse(left.state_json);
  const rightState = JSON.parse(right.state_json);
  const patchLeft = computePatch(baseState, leftState);
  const patchRight = computePatch(baseState, rightState);
  const ms = buildMergeSections({ baseState, patchLeft, patchRight, leftState, rightState });
  return { storeState: buildMergeStoreState({ baseState, leftState, rightState, nameOverride, mergeSections: ms.sections }), conflicts: ms.conflicts };
}

function buildMergeSections(ctx) {
  const { baseState, patchLeft, patchRight, leftState, rightState } = ctx;
  const decisions = mergeDecisionsSection({ baseState, patchLeft, patchRight });
  const memories = mergeMemoriesSection({ baseState, patchLeft, patchRight });
  const runs = mergeRunsSection({ baseState, patchLeft, patchRight });
  const plasmids = mergePlasmidsSection({ baseState, patchLeft, patchRight });
  const permissions = mergePermissionSection({ base: baseState.permissions || [], left: leftState.permissions || [], right: rightState.permissions || [] });
  return {
    sections: {
      decisions: decisions.merged,
      memories: memories.merged,
      runs: runs.merged,
      plasmids: plasmids.merged,
      permissions: permissions.merged,
      events: mergeEvents({ base: baseState.events || [], left: leftState.events || [], right: rightState.events || [] }),
      children: mergeChildren({ base: baseState.children || [], left: leftState.children || [], right: rightState.children || [] })
    },
    conflicts: [...decisions.conflicts, ...memories.conflicts, ...runs.conflicts, ...plasmids.conflicts, ...permissions.conflicts]
  };
}

function mergeDecisionsSection(ctx) {
  const { baseState, patchLeft, patchRight } = ctx;
  return mergeArraySection({ base: baseState.decisions || [], patchLeft, patchRight, sectionName: 'decisions' });
}

function mergeMemoriesSection(ctx) {
  const { baseState, patchLeft, patchRight } = ctx;
  return mergeArraySection({ base: baseState.memories || [], patchLeft, patchRight, sectionName: 'memories' });
}

function mergeRunsSection(ctx) {
  const { baseState, patchLeft, patchRight } = ctx;
  return mergeArraySection({ base: baseState.runs || [], patchLeft, patchRight, sectionName: 'runs' });
}

function mergePlasmidsSection(ctx) {
  const { baseState, patchLeft, patchRight } = ctx;
  return mergeArraySection({ base: baseState.plasmids || [], patchLeft, patchRight, sectionName: 'plasmids' });
}

function buildMergeStoreState(ctx) {
  const { baseState, leftState, rightState, nameOverride, mergeSections } = ctx;
  return {
    schema: 'genos.agent-git-state/v1',
    agent: {
      ...(leftState.agent || baseState.agent),
      name: nameOverride || `Merge of left + right`
    },
    ...mergeSections,
    events: mergeSections.events || [],
    children: mergeSections.children || []
  };
}

async function createMergeCommit(ctx) {
  const { db, req, left, base, merged, leftId, rightId } = ctx;
  const isMerge = base && base.id !== leftId && base.id !== rightId;
  const mergeParents = isMerge ? [leftId, rightId] : [leftId];
  const commitResult = await storeObject(db, {
    agentId: req.body?.targetAgentId || left.agent_id,
    workspaceId: left.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'merge',
    state: merged.storeState,
    createdBy: req.user?.username || 'agent-git',
    metadata: {
      mergeParents: [leftId, rightId],
      mergeBase: base?.id || null,
      merge: isMerge,
      fastForward: !isMerge
    },
    parentCommitIds: mergeParents
  });
  await updateRef({ db, req, agentId: req.body?.targetAgentId || left.agent_id, refName: req.body?.refName || 'merge', objectId: commitResult.id, options: { action: 'merge' } });
  return commitResult;
}

function mergePermissionSection(ctx) {
  const { base, left, right } = ctx;
  const denyWins = collectDeniedTools([...base, ...left, ...right]);
  const baseMap = buildScopeMap(base);
  const leftMap = buildScopeMap(left);
  const rightMap = buildScopeMap(right);
  const keys = new Set([...baseMap.keys(), ...leftMap.keys(), ...rightMap.keys()]);
  const merged = [];
  const conflicts = [];
  for (const key of keys) {
    mergeOneScope({ key, baseMap, leftMap, rightMap, denyWins, merged, conflicts });
  }
  return { merged, conflicts };
}

function buildScopeMap(rows) {
  const map = new Map();
  for (const p of rows || []) {
    const k = `${p.organization_id || ''}:${p.project_id || ''}`;
    map.set(k, { org: p.organization_id, proj: p.project_id, allows: new Set(parseJsonArray(p.permissions_json)) });
  }
  return map;
}

function parseJsonArray(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}

function mergeOneScope(ctx) {
  const { key, baseMap, leftMap, rightMap, denyWins, merged, conflicts } = ctx;
  const baseAllows = baseMap.get(key)?.allows || new Set();
  const leftAllows = leftMap.get(key)?.allows || new Set();
  const rightAllows = rightMap.get(key)?.allows || new Set();
  const effective = intersectSets(leftAllows, rightAllows);
  const unilateral = findUnilateralGrants({ baseAllows, leftAllows, rightAllows, effective });
  for (const tool of unilateral) {
    conflicts.push({ section: 'permissions', itemId: key, reason: 'privilege-requires-approval', tool });
  }
  const meta = leftMap.get(key) || rightMap.get(key) || baseMap.get(key);
  if (effective.size === 0 && !leftMap.has(key) && !rightMap.has(key)) return;
  merged.push({
    organization_id: meta.org,
    project_id: meta.proj,
    permissions_json: JSON.stringify([...effective].filter(t => !denyWins.has(t))),
    denied_tools_json: JSON.stringify([...denyWins])
  });
}

function intersectSets(left, right) {
  return new Set([...left].filter(t => right.has(t)));
}

function findUnilateralGrants(ctx) {
  const { baseAllows, leftAllows, rightAllows, effective } = ctx;
  const union = new Set([...leftAllows, ...rightAllows]);
  const grants = [];
  for (const tool of union) {
    if (!baseAllows.has(tool) && !effective.has(tool)) grants.push(tool);
  }
  return grants;
}

// --- Revert ---

async function revert(req) {
  const db = await getDatabase();
  const object = await getObjectScoped(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };

  const commit = await getCommit(db, object.id);
  const targetAgentId = req.body?.targetAgentId || object.agent_id;
  const patch = await buildRevertPatch({ db, req, commit, object });

  const result = await applyPatch(req, {
    targetAgentId,
    patch,
    sections: ['decisions', 'memories', 'runs', 'plasmids', 'permissions']
  });

  // Point 5 : le commit de revert capture l'état APRÈS application du patch
  // inverse — pas l'état du commit qu'on vient d'annuler.
  const resultingState = await collectStateScoped(db, req, targetAgentId);
  const commitResult = await storeObject(db, {
    agentId: targetAgentId,
    workspaceId: object.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'main',
    state: resultingState,
    createdBy: req.user?.username || 'agent-git',
    metadata: { revertOf: object.id, reverted: true, inversePatch: true }
  });

  await updateRef({ db, req, agentId: targetAgentId, refName: req.body?.refName || 'main', objectId: commitResult.id, options: { action: 'revert' } });
  return { success: true, operation: 'revert', revertedObjectId: object.id, ...result, ...commitResult };
}

async function buildRevertPatch(ctx) {
  const { db, req, commit, object } = ctx;
  if (commit.parentIds && commit.parentIds.length > 0) {
    const parentObj = await getObjectScoped(db, req, commit.parentIds[0]);
    if (parentObj) {
      return computePatch(JSON.parse(object.state_json), JSON.parse(parentObj.state_json));
    }
  }
  return computePatch(JSON.parse(object.state_json), emptyState());
}

// --- Rebase (extrait vers rebaseOperations.cjs, points 9/10) ---
const { rebase } = require('./rebaseOperations.cjs');

module.exports = { cherryPick, merge, revert, rebase };
