'use strict';

const { getDatabase } = require('../../db');

async function getCommit(db, commitId) {
  const obj = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', commitId);
  if (!obj) return null;
  const parents = await db.all(
    'SELECT parent_commit_id FROM agent_git_commit_parents WHERE commit_id = ? ORDER BY rowid',
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

module.exports = { getCommit, findMergeBase, collectAncestors };
