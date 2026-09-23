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
  // L'API documentée est leftObjectId/rightObjectId (cf. message d'erreur et
  // merge-base) ; leftId/rightId reste accepté pour compat.
  const leftId = req.body?.leftObjectId || req.body?.leftId;
  const rightId = req.body?.rightObjectId || req.body?.rightId;
  if (!leftId || !rightId) return { success: false, error: 'Both leftObjectId and rightObjectId are required.' };

  const left = await getObjectScoped(db, req, leftId);
  const right = await getObjectScoped(db, req, rightId);
  if (!left || !right) return { success: false, error: 'Both commits must exist.' };

  const targetAgentId = req.body?.targetAgentId || left.agent_id;
  const base = await findMergeBase(db, leftId, rightId);
  const merged = buildMergedState({ base, left, right, name: req.body?.name });

  await enforceHooks({ db, agentId: targetAgentId, hookName: 'merge-validation', context: merged.storeState });

  const result = await replaceState(req, {
    targetAgentId,
    state: merged.storeState,
    sections: ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']
  });

  const commitResult = await createMergeCommit({ db, req, left, base, merged, leftId, rightId });
  return { success: true, operation: 'merge', ...result, ...commitResult, mergeBase: base?.id || null, leftCommitId: leftId, rightCommitId: rightId };
}

function buildMergedState(ctx) {
  const { base, left, right, nameOverride } = ctx;
  const baseState = base ? JSON.parse(base.state_json) : emptyState();
  const leftState = JSON.parse(left.state_json);
  const rightState = JSON.parse(right.state_json);
  const patchLeft = computePatch(baseState, leftState);
  const patchRight = computePatch(baseState, rightState);
  const ms = buildMergeSections({ baseState, patchLeft, patchRight, leftState, rightState });
  return { storeState: buildMergeStoreState({ baseState, leftState, rightState, nameOverride, mergeSections: ms }) };
}

function buildMergeSections(ctx) {
  const { baseState, patchLeft, patchRight, leftState, rightState } = ctx;
  return {
    decisions: mergeDecisionsSection({ baseState, patchLeft, patchRight }),
    memories: mergeMemoriesSection({ baseState, patchLeft, patchRight }),
    runs: mergeRunsSection({ baseState, patchLeft, patchRight }),
    plasmids: mergePlasmidsSection({ baseState, patchLeft, patchRight }),
    permissions: mergePermissionSection({ base: baseState.permissions || [], left: leftState.permissions || [], right: rightState.permissions || [] }),
    events: mergeEvents({ base: baseState.events || [], left: leftState.events || [], right: rightState.events || [] }),
    children: mergeChildren({ base: baseState.children || [], left: leftState.children || [], right: rightState.children || [] })
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
  const all = [...base, ...left, ...right];
  const denyWins = collectDeniedTools(all);
  const byKey = buildPermMap(all);
  return flattenPermMap(byKey, denyWins);
}

function buildPermMap(all) {
  const byKey = {};
  for (const p of all) {
    const k = `${p.organization_id || ''}:${p.project_id || ''}`;
    if (!byKey[k]) byKey[k] = { org: p.organization_id, proj: p.project_id, perms: new Set() };
    for (const t of JSON.parse(p.permissions_json || '[]')) byKey[k].perms.add(t);
  }
  return byKey;
}

function flattenPermMap(byKey, denyWins) {
  return Object.values(byKey).map(m => ({
    organization_id: m.org,
    project_id: m.proj,
    permissions_json: JSON.stringify([...m.perms].filter(t => !denyWins.has(t))),
    denied_tools_json: JSON.stringify([...denyWins])
  }));
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
