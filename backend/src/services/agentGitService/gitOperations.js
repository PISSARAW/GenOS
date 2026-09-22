'use strict';

const { getCommit, findMergeBase, collectAncestors } = require('./commitGraph');
const { computePatch, applyPatch, replaceState } = require('./dagOperations');
const { storeObject } = require('./storeObjectHelper.cjs');
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

  const commitResult = await storeObject(db, {
    agentId: targetAgentId,
    workspaceId: object.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'main',
    state: JSON.parse(object.state_json),
    createdBy: req.user?.username || 'agent-git',
    metadata: { cherryPickedFrom: object.id, cherryPicked: true, patchOpCount: patch.operations.length }
  });

  return { success: true, operation: 'cherry-pick', objectId: object.id, ...result, ...commitResult };
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
  const { leftId, rightId } = req.body || {};
  if (!leftId || !rightId) return { success: false, error: 'Both leftObjectId and rightObjectId are required.' };

  const left = await getObjectScoped(db, req, leftId);
  const right = await getObjectScoped(db, req, rightId);
  if (!left || !right) return { success: false, error: 'Both commits must exist.' };

  const base = await findMergeBase(db, leftId, rightId);
  const merged = buildMergedState({ base, left, right, name: req.body?.name });

  const targetAgentId = req.body?.targetAgentId || left.agent_id;
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

  return {
    storeState: buildMergeStoreState({
      baseState, leftState, rightState, nameOverride,
      mergeSections: {
        decisions: mergeArraySection({ base: baseState.decisions || [], patchLeft, patchRight, sectionName: 'decisions' }),
        memories: mergeArraySection({ base: baseState.memories || [], patchLeft, patchRight, sectionName: 'memories' }),
        runs: mergeArraySection({ base: baseState.runs || [], patchLeft, patchRight, sectionName: 'runs' }),
        plasmids: mergeArraySection({ base: baseState.plasmids || [], patchLeft, patchRight, sectionName: 'plasmids' }),
        permissions: mergePermissionSection({ base: baseState.permissions || [], left: leftState.permissions || [], right: rightState.permissions || [] })
      }
    })
  };
}

function buildMergeStoreState(ctx) {
  const { baseState, leftState, rightState, nameOverride, mergeSections } = ctx;
  return {
    schema: 'genos.agent-git-state/v1',
    agent: {
      ...(leftState.agent || baseState.agent),
      name: nameOverride || `Merge of left + right`
    },
    ...mergeSections
  };
}

async function createMergeCommit(ctx) {
  const { db, req, left, base, merged, leftId, rightId } = ctx;
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
      parentCommitId: leftId
    },
    parentCommitId: leftId
  });

  if (base && base.id !== leftId && base.id !== rightId) {
    await db.run('INSERT OR IGNORE INTO agent_git_commit_parents (commit_id, parent_commit_id) VALUES (?, ?)', commitResult.id, rightId);
  }
  return commitResult;
}

function mergeArraySection(ctx) {
  const { base, patchLeft, patchRight, sectionName } = ctx;
  const leftAdds = new Set(filterOps(patchLeft.operations, sectionName, 'ADD').map(o => o.item.id));
  const leftRemoves = new Set(filterOps(patchLeft.operations, sectionName, 'REMOVE').map(o => o.itemId));
  const rightAdds = new Set(filterOps(patchRight.operations, sectionName, 'ADD').map(o => o.item.id));
  const rightRemoves = new Set(filterOps(patchRight.operations, sectionName, 'REMOVE').map(o => o.itemId));

  const kept = filterBaseItems(base, leftRemoves, rightRemoves);
  const result = [...kept.items];
  const seen = new Set(kept.seen);

  appendAddOps({ result, seen, addOps: filterOps(patchLeft.operations, sectionName, 'ADD'), conflictingRemoves: rightRemoves });
  appendAddOps({ result, seen, addOps: filterOps(patchRight.operations, sectionName, 'ADD'), conflictingRemoves: leftRemoves });
  return result;
}

function filterOps(operations, section, op) {
  return operations.filter(o => o.section === section && o.op === op);
}

function filterBaseItems(base, leftRemoves, rightRemoves) {
  const seen = new Set();
  const items = [];
  for (const item of base) {
    if (leftRemoves.has(item.id) || rightRemoves.has(item.id)) continue;
    items.push(item);
    seen.add(item.id);
  }
  return { items, seen };
}

function appendAddOps(ctx) {
  const { result, seen, addOps, conflictingRemoves } = ctx;
  for (const op of addOps) {
    if (!seen.has(op.item.id) && !conflictingRemoves.has(op.item.id)) {
      result.push(op.item);
      seen.add(op.item.id);
    }
  }
}

function mergePermissionSection(ctx) {
  const { base, left, right } = ctx;
  const all = [...base, ...left, ...right];
  const denyWins = collectDeniedTools(all);
  const allows = [];
  for (const p of all) {
    const perms = JSON.parse(p.permissions_json || '[]');
    const filtered = [...new Set(perms.filter(t => !denyWins.has(t)))];
    if (filtered.length > 0) {
      allows.push({ ...p, permissions_json: JSON.stringify(filtered) });
    }
  }
  return allows;
}

function collectDeniedTools(permissions) {
  const denied = new Set();
  for (const p of permissions) {
    const items = JSON.parse(p.denied_tools_json || '[]');
    for (const d of items) denied.add(d);
  }
  return denied;
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

  const commitResult = await storeObject(db, {
    agentId: targetAgentId,
    workspaceId: object.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'main',
    state: JSON.parse(object.state_json),
    createdBy: req.user?.username || 'agent-git',
    metadata: { revertOf: object.id, reverted: true, inversePatch: true }
  });

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

// --- Rebase ---

async function rebase(req) {
  const db = await getDatabase();
  const ontoId = req.body?.ontoObjectId;
  const headId = req.body?.headObjectId || req.body?.oursObjectId;

  if (!ontoId || !headId) return { success: false, error: 'Both ontoObjectId and headObjectId are required.' };

  const onto = await getObjectScoped(db, req, ontoId);
  const head = await getObjectScoped(db, req, headId);
  if (!onto || !head) return { success: false, error: 'Both commits must exist.' };

  const base = await findMergeBase(db, headId, ontoId);
  const replayedIds = [];
  const currentState = await replayOntoBase({ db, base, headId, replayedIds });

  const commitResult = await commitRebase({ db, req, onto, head, base, currentState, replayedIds, ontoId });
  return { success: true, operation: 'rebase', ...commitResult, replayedCommits: replayedIds, mergeBase: base?.id || null };
}

async function replayOntoBase(ctx) {
  const { db, base, headId, replayedIds } = ctx;
  const commitsToReplay = await collectCommitsToReplay(db, base, headId);
  const baseState = base ? JSON.parse(base.state_json) : { ...emptyState(), agent: {} };
  let currentState = { ...baseState };

  for (const commit of commitsToReplay) {
    const commitState = JSON.parse(commit.state_json);
    const patch = computePatch(baseState, commitState);
    currentState = applyPatchToState(currentState, patch);
    replayedIds.push(commit.id);
  }
  return currentState;
}

async function collectCommitsToReplay(db, base, headId) {
  let currentId = headId;
  const commits = [];
  while (currentId && currentId !== base?.id) {
    const commit = await getCommit(db, currentId);
    if (!commit) break;
    commits.unshift(commit);
    currentId = commit.parentIds && commit.parentIds.length > 0 ? commit.parentIds[0] : null;
  }
  return commits;
}

function applyPatchToState(state, patch) {
  const newState = { ...state };
  for (const op of patch.operations) {
    if (!op.section) continue;
    if (op.op === 'ADD') {
      newState[op.section] = [...(newState[op.section] || []), op.item];
    } else if (op.op === 'REMOVE') {
      newState[op.section] = (newState[op.section] || []).filter(i => i.id !== op.itemId);
    }
  }
  return newState;
}

async function commitRebase(ctx) {
  const { db, req, onto, head, base, currentState, replayedIds, ontoId } = ctx;
  const targetAgentId = req.body?.targetAgentId || head.agent_id;
  const stateForStore = buildRebaseStoreState(currentState, onto, head);

  return storeObject(db, {
    agentId: targetAgentId,
    workspaceId: head.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || onto.ref_name || 'main',
    state: stateForStore,
    createdBy: req.user?.username || 'agent-git',
    metadata: {
      rebaseFrom: req.body?.headObjectId || req.body?.oursObjectId,
      rebaseOnto: ontoId,
      mergeBase: base?.id || null,
      replayedCommits: replayedIds
    },
    parentCommitId: ontoId
  });
}

function buildRebaseStoreState(currentState, onto, head) {
  return {
    ...currentState,
    agent: {
      ...(currentState.agent || {}),
      ...(JSON.parse(onto.state_json).agent || {}),
      ...(JSON.parse(head.state_json).agent || {})
    },
    schema: 'genos.agent-git-state/v1'
  };
}

// --- Bisect ---

async function bisect(req) {
  const db = await getDatabase();
  const goodId = req.body?.goodObjectId;
  const badId = req.body?.badObjectId;
  const field = String(req.body?.field || '').trim();
  const expected = req.body?.expectedValue;

  if (!goodId || !badId) return { success: false, error: 'Both goodObjectId and badObjectId are required (causal bisect).' };

  const badAncestors = await collectAncestors(db, badId);
  const goodAncestors = await collectAncestors(db, goodId);
  const causalPath = badAncestors.filter(a => goodAncestors.some(g => g.id === a.id) || a.id === goodId);
  causalPath.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (causalPath.length < 2) return { success: false, error: 'At least two commits on the causal path are required.' };

  const value = (object) => String(field).split('.').reduce((current, key) => current == null ? undefined : current[key], JSON.parse(object.state_json));
  const matches = (object) => JSON.stringify(value(object)) === JSON.stringify(expected);

  const { culprit, iterations } = runBinarySearch(causalPath, matches);

  return {
    success: true,
    operation: 'bisect',
    goodCommitId: goodId,
    badCommitId: badId,
    field,
    expectedValue: expected,
    anomalyFound: culprit >= 0,
    culpritObjectId: culprit >= 0 ? causalPath[culprit].id : null,
    causalPathLength: causalPath.length,
    iterations,
    complexity: `O(log2(${causalPath.length}))`
  };
}

function runBinarySearch(sortedArray, predicate) {
  let low = 1;
  let high = sortedArray.length - 1;
  let culprit = -1;
  let iterations = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    iterations += 1;
    if (predicate(sortedArray[middle])) {
      low = middle + 1;
    } else {
      culprit = middle;
      high = middle - 1;
    }
  }
  return { culprit, iterations };
}

module.exports = { cherryPick, merge, revert, rebase, bisect };
