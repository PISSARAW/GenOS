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
  const common = ancestorsA.filter(a => ancestorsB.some(b => b.id === a.id));
  if (common.length === 0) return null;
  common.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return common[0];
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
