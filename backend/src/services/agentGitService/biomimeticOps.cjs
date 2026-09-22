'use strict';

const { getCommit, collectAncestors, findMergeBase } = require('./commitGraph');
const { storeObject } = require('./storeObjectHelper.cjs');
const { updateRef } = require('./refs');
const { getDatabase } = require('../../db');

/**
 * Biomimetic operations — couche sémantique sur les opérations Git.
 *
 * HGT = transfert horizontal de gènes (cherry-pick certifié avec preuve)
 * Spéciation = création d'une lignée divergente (branche)
 * Recombinaison = merge de deux lignées
 * Migration = remote (échange d'états entre agents)
 * Fossile = tag immuable (spécimen de référence)
 * Apoptose = GC sélectif (élimination des états obsolètes)
 */

async function hgtCherryPick(req) {
  const db = await getDatabase();
  const objectId = req.body?.objectId;
  const targetAgentId = req.body?.targetAgentId;
  if (!objectId || !targetAgentId) return { success: false, error: 'Both objectId and targetAgentId are required.' };

  const object = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', objectId);
  if (!object) return { success: false, error: 'Source object not found.' };

  // Vérifier que le commit est dans l'arbre du agent cible (preuve de parenté)
  const ancestors = await collectAncestors(db, targetAgentId);
  const ancestorIds = new Set(ancestors.map(a => a.id));
  if (!ancestorIds.has(objectId)) {
    return { success: false, error: 'HGT rejected: source commit not in target agent ancestry.' };
  }

  const commit = await getCommit(db, objectId);
  const result = await storeObject(db, {
    agentId: targetAgentId,
    workspaceId: object.workspace_id,
    kind: 'commit',
    refName: req.body?.refName || 'main',
    state: JSON.parse(object.state_json),
    createdBy: req.user?.username || 'agent-git',
    metadata: { hgt: true, sourceAgentId: object.agent_id, sourceCommitId: objectId },
    parentCommitId: commit.parentIds && commit.parentIds.length > 0 ? commit.parentIds[0] : null
  });

  await updateRef({ db, req, agentId: targetAgentId, refName: req.body?.refName || 'main', objectId: result.id, options: { action: 'hgt' } });
  return { success: true, operation: 'hgt', ...result };
}

async function speciation(req) {
  const db = await getDatabase();
  const agentId = req.body?.agentId;
  const branchName = req.body?.branchName || `speciation-${Date.now()}`;
  if (!agentId) return { success: false, error: 'agentId is required.' };

  const current = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, 'main');
  if (!current?.object_id) return { success: false, error: 'Agent has no main ref to branch from.' };

  const sourceCommit = await getCommit(db, current.object_id);
  const result = await storeObject(db, {
    agentId,
    workspaceId: sourceCommit.workspace_id,
    kind: 'commit',
    refName: branchName,
    state: JSON.parse(sourceCommit.state_json),
    createdBy: req.user?.username || 'agent-git',
    metadata: { speciation: true, parentRef: 'main', parentCommitId: sourceCommit.id },
    parentCommitId: sourceCommit.id
  });

  return { success: true, operation: 'speciation', branchName, ...result };
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

  // Ne supprimer que les commits qui ne sont pas atteignables depuis une ref
  const refs = await db.all('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND object_id IS NOT NULL', agentId);
  const reachableIds = new Set();
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
