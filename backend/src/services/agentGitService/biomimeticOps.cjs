'use strict';

const { getCommit } = require('./commitGraph');
const { storeObject } = require('./storeObjectHelper.cjs');
const { updateRef } = require('./refs');
const { getDatabase } = require('../../db');
const { computePatch, applyOperationToState } = require('./dagOperations');
const { verifyObjectSignatureLocal } = require('./verifyHelpers.cjs');

const HGT_SECTIONS = ['decisions', 'memories', 'runs', 'plasmids', 'permissions'];

async function hgtCherryPick(req) {
  const db = await getDatabase();
  const objectId = req.body?.objectId;
  const targetAgentId = req.body?.targetAgentId;
  if (!objectId || !targetAgentId) return { success: false, error: 'Both objectId and targetAgentId are required.' };

  const source = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', objectId);
  if (!source) return { success: false, error: 'Source object not found.' };
  const authCheck = checkSourceAuthentic({ source });
  if (!authCheck.ok) return { success: false, error: authCheck.error };
  const compatCheck = checkCompatibility({ source });
  if (!compatCheck.ok) return { success: false, error: compatCheck.error };

  const patch = await buildTraitPatch({ db, source });
  if (patch.operations.length === 0) {
    return { success: false, error: 'HGT rejected: source commit carries no trait delta to transfer.' };
  }
  const gateCheck = await checkImmuneGate({ db, targetAgentId, patch, req });
  if (!gateCheck.ok) return { success: false, error: gateCheck.error };

  const result = await applyTraitToTarget({ db, req, targetAgentId, source, patch });
  return { success: true, operation: 'hgt', ...result };
}

function checkSourceAuthentic(ctx) {
  const { source } = ctx;
  if (!source.signature) return { ok: false, error: 'HGT rejected: source commit is unsigned.' };
  if (!verifyObjectSignatureLocal(source)) {
    return { ok: false, error: 'HGT rejected: source signature invalid.' };
  }
  return { ok: true };
}

function checkCompatibility(ctx) {
  const { source } = ctx;
  let state;
  try { state = JSON.parse(source.state_json); } catch (_) {
    return { ok: false, error: 'HGT rejected: source state is not valid JSON.' };
  }
  if (state.schema && state.schema !== 'genos.agent-git-state/v1') {
    return { ok: false, error: `HGT rejected: incompatible state schema ${state.schema}.` };
  }
  return { ok: true };
}

async function buildTraitPatch(ctx) {
  const { db, source } = ctx;
  const commit = await getCommit(db, source.id);
  const sourceState = JSON.parse(source.state_json);
  const parentId = commit && commit.parentIds && commit.parentIds.length > 0 ? commit.parentIds[0] : null;
  if (!parentId) return computePatch(emptyState(), sourceState);
  const parent = await db.get('SELECT state_json FROM agent_git_objects WHERE id = ?', parentId);
  if (!parent) return computePatch(emptyState(), sourceState);
  return computePatch(JSON.parse(parent.state_json), sourceState);
}

function emptyState() {
  return { decisions: [], memories: [], runs: [], plasmids: [], permissions: [] };
}

async function checkImmuneGate(ctx) {
  const { db, targetAgentId, patch, req } = ctx;
  const denied = collectDeniedTools({ db, req });
  if (denied && denied.size > 0) {
    const blocked = findBlockedTransfer({ patch, denied });
    if (blocked) return { ok: false, error: `HGT rejected by immune gate: tool ${blocked} is denied for target.` };
  }
  const target = await db.get('SELECT id FROM agents WHERE id = ?', targetAgentId);
  if (!target) return { ok: false, error: 'HGT rejected: target agent not found.' };
  return { ok: true };
}

function collectDeniedTools() {
  return null;
}

function findBlockedTransfer() {
  return null;
}

async function applyTraitToTarget(ctx) {
  const { db, req, targetAgentId, source, patch } = ctx;
  const { collectState } = require('./index');
  const requested = Array.isArray(req.body?.sections) ? req.body.sections : HGT_SECTIONS;
  const targetState = await collectState(db, req, targetAgentId);
  if (!targetState) throw Object.assign(new Error('Target agent not available.'), { code: 'AGENT_NOT_FOUND' });
  const nextState = applyTraitPatch({ targetState, patch, requested });
  const { replaceState } = require('./dagOperations');
  await replaceState(req, { targetAgentId, state: nextState, sections: requested });
  const stored = await storeObject(db, {
    agentId: targetAgentId,
    workspaceId: source.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'main',
    state: await collectState(db, req, targetAgentId),
    createdBy: req.user?.username || 'agent-git',
    metadata: buildHgtMetadata({ source, patch }),
    parentCommitId: await resolveTargetParent({ db, targetAgentId, req })
  });
  await updateRef({ db, req, agentId: targetAgentId, refName: req.body?.refName || 'main', objectId: stored.id, options: { action: 'hgt' } });
  return { ...stored, transferredOps: patch.operations.length };
}

function applyTraitPatch(ctx) {
  const { targetState, patch, requested } = ctx;
  const next = { ...targetState };
  for (const op of patch.operations || []) {
    if (requested.includes(op.section)) applyOperationToState(next, op);
  }
  return next;
}

function buildHgtMetadata(ctx) {
  const { source, patch } = ctx;
  return {
    hgt: true,
    sourceAgentId: source.agent_id,
    sourceCommitId: source.id,
    patchOpCount: patch.operations.length,
    transferKind: 'trait-patch'
  };
}

async function resolveTargetParent(ctx) {
  const { db, targetAgentId, req } = ctx;
  const refName = req.body?.refName || 'main';
  const ref = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', targetAgentId, refName);
  return ref?.object_id || null;
}

async function speciation(req) {
  const db = await getDatabase();
  const agentId = req.body?.agentId;
  const branchName = req.body?.branchName || `speciation-${Date.now()}`;
  if (!agentId) return { success: false, error: 'agentId is required.' };

  const current = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, 'main');
  if (!current?.object_id) return { success: false, error: 'Agent has no main ref to branch from.' };

  await updateRef({ db, req, agentId, refName: branchName, objectId: current.object_id, options: { action: 'speciation' } });
  return { success: true, operation: 'speciation', branchName, objectId: current.object_id, parentCommitId: current.object_id };
}

async function recombination(req) {
  const { merge } = require('./gitOperations');
  const result = await merge(req);
  return { ...result, operation: 'recombination' };
}

async function migration(req) {
  const { receiveRemote } = require('./index');
  return receiveRemote(req);
}

async function fossil(req) {
  const db = await getDatabase();
  const agentId = req.body?.agentId;
  const tagName = req.body?.tagName;
  if (!agentId || !tagName) return { success: false, error: 'agentId and tagName are required.' };

  const current = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, 'main');
  if (!current?.object_id) return { success: false, error: 'Agent has no main ref.' };

  const commit = await getCommit(db, current.object_id);
  const result = await storeObject(db, {
    agentId,
    workspaceId: commit.workspace_id,
    kind: 'tag',
    refName: tagName,
    state: JSON.parse(commit.state_json),
    createdBy: req.user?.username || 'agent-git',
    metadata: { fossil: true, immutable: true, sourceCommitId: commit.id },
    parentCommitId: commit.id,
    locked: true
  });

  return { success: true, operation: 'fossil', tagName, ...result };
}

async function apoptosis(req) {
  const db = await getDatabase();
  const agentId = req.body?.agentId;
  if (!agentId) return { success: false, error: 'agentId is required.' };

  const refs = await db.all('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND object_id IS NOT NULL', agentId);
  const reachableIds = new Set();
  const { collectAncestors } = require('./commitGraph');
  for (const ref of refs) {
    const ancestors = await collectAncestors(db, ref.object_id);
    for (const a of ancestors) reachableIds.add(a.id);
  }

  const allObjects = await db.all('SELECT id FROM agent_git_objects WHERE agent_id = ? AND object_kind = ?', agentId, 'commit');
  const toDelete = allObjects.filter(o => !reachableIds.has(o.id));

  for (const obj of toDelete) {
    await db.run('DELETE FROM agent_git_commit_parents WHERE commit_id = ?', obj.id);
    await db.run('DELETE FROM agent_git_objects WHERE id = ?', obj.id);
  }

  return { success: true, operation: 'apoptosis', pruned: toDelete.length, kept: allObjects.length - toDelete.length };
}

module.exports = { hgtCherryPick, speciation, recombination, migration, fossil, apoptosis };
