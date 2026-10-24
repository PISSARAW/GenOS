'use strict';

const { getDatabase } = require('./agentGitDb.cjs');

async function getCommit(db, commitId) {
  db = require('./agentGitDb.cjs').wrap(db);
  const obj = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', commitId);
  if (!obj) return null;
  const parents = await db.all(
    'SELECT parent_commit_id FROM agent_git_commit_parents WHERE commit_id = ? ORDER BY position, rowid',
    commitId
  );
  return { ...obj, parentIds: parents.map(p => p.parent_commit_id) };
}

async function findMergeBase(db, commitIdA, commitIdB) {
  const ancestorsA = await collectAncestors(db, commitIdA);
  const ancestorsB = await collectAncestors(db, commitIdB);
  const idsB = new Set(ancestorsB.map(b => b.id));
  const common = ancestorsA.filter(a => idsB.has(a.id));
  if (common.length === 0) return null;
  // Point 12 : best ancestor = ancêtre commun non dominé par un autre ancêtre
  // commun. Le tri par created_at (ancienne implémentation) choisit l'ancêtre
  // le plus récent, qui peut être dominé par un ancêtre plus profond — mauvais
  // merge-base avec des imports distants ou des merges croisés.
  const dominated = await collectDominatedIds(db, common);
  const candidates = common.filter(c => !dominated.has(c.id));
  const best = (candidates.length ? candidates : common);
  return best.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

// Un ancêtre commun C est dominé s'il existe un autre ancêtre commun D
// (D != C) tel que C est un ancêtre STRICT de D (C est plus profond que D).
async function collectDominatedIds(db, common) {
  const dominated = new Set();
  for (const candidate of common) {
    if (dominated.has(candidate.id)) continue;
    const candidateAncestors = await collectAncestors(db, candidate.id);
    const candidateAncestorIds = new Set(candidateAncestors.map(a => a.id));
    candidateAncestorIds.delete(candidate.id);
    for (const other of common) {
      if (other.id !== candidate.id && candidateAncestorIds.has(other.id)) {
        dominated.add(other.id);
      }
    }
  }
  return dominated;
}

async function collectAncestors(db, commitId) {
  const visited = new Set();
  const queue = [commitId];
  const ancestors = [];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const commit = await getCommit(db, currentId);
    if (!commit) continue;
    ancestors.push(commit);
    for (const parentId of commit.parentIds) {
      if (!visited.has(parentId)) queue.push(parentId);
    }
  }
  return ancestors;
}

// Ensemble des ids d'objets accessibles depuis les refs d'un agent
// (parcours du DAG des commits pointés par chaque ref). Utilisé par gc() pour
// ne jamais supprimer un objet encore référencé.
async function collectReachableObjectIds(db, agentId, scope) {
  const reachable = new Set();
  const refs = await db.all(`SELECT r.object_id FROM agent_git_refs r LEFT JOIN agents a ON a.id = r.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE r.agent_id = ? AND ${scope.clause}`, agentId, ...scope.params);
  for (const ref of refs || []) {
    if (ref.object_id) {
      const ancestors = await collectAncestors(db, ref.object_id);
      for (const a of ancestors || []) reachable.add(a.id);
    }
  }
  return reachable;
}

module.exports = { getCommit, findMergeBase, collectAncestors, collectReachableObjectIds };
