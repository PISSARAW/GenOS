'use strict';

const { collectAncestors } = require('./commitGraph');

function bounds(options = {}) {
  const keep = Number(options.keep ?? 20);
  const days = Number(options.retentionDays ?? 30);
  if (!Number.isInteger(keep) || keep < 0 || keep > 1000 ||
      !Number.isInteger(days) || days < 0 || days > 3650) {
    throw new Error('GC keep and retentionDays must be bounded nonnegative integers.');
  }
  return { keep, days };
}

async function rootIds(db, agentId, days) {
  const [refs, archives, notes, recent, tags] = await Promise.all([
    db.all('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND object_id IS NOT NULL', agentId),
    db.all('SELECT object_id FROM agent_git_archives WHERE agent_id = ?', agentId),
    db.all('SELECT object_id FROM agent_git_notes WHERE agent_id = ?', agentId),
    db.all("SELECT old_object_id, new_object_id FROM agent_git_reflog WHERE agent_id = ? AND datetime(created_at) >= datetime('now', ?)", agentId, `-${days} days`),
    db.all("SELECT id AS object_id FROM agent_git_objects WHERE agent_id = ? AND object_kind = 'tag'", agentId)
  ]);
  return new Set([...refs, ...archives, ...notes, ...tags].map((row) => row.object_id)
    .concat(recent.flatMap((row) => [row.old_object_id, row.new_object_id])).filter(Boolean));
}

async function markAncestors(db, agentId, roots) {
  const marked = new Set();
  for (const id of roots) {
    const ancestors = await collectAncestors(db, id);
    for (const object of ancestors) if (object.agent_id === agentId) marked.add(object.id);
  }
  return marked;
}

async function pruneUnreachable(db, agentId, options = {}) {
  const { keep, days } = bounds(options);
  const rows = await db.all(`SELECT id, object_kind,
    datetime(created_at) >= datetime('now', ?) AS recent
    FROM agent_git_objects WHERE agent_id = ? ORDER BY created_at DESC, id DESC`, `-${days} days`, agentId);
  const roots = await rootIds(db, agentId, days);
  const referenced = await markAncestors(db, agentId, roots);
  const unreferenced = rows.filter((row) => !referenced.has(row.id));
  const retainedRoots = unreferenced.filter((row, index) => row.recent || index < keep).map((row) => row.id);
  const retained = await markAncestors(db, agentId, retainedRoots);
  const stale = rows.filter((row) => !referenced.has(row.id) && !retained.has(row.id));
  for (const row of stale) {
    await db.run('DELETE FROM agent_git_commit_parents WHERE commit_id = ?', row.id);
    await db.run('DELETE FROM agent_git_commits WHERE commit_id = ?', row.id);
    await db.run('DELETE FROM agent_git_objects WHERE id = ? AND agent_id = ?', row.id, agentId);
  }
  return { pruned: stale.length, kept: rows.length - stale.length,
    skippedReachable: referenced.size, retainedByPolicy: retained.size };
}

module.exports = { pruneUnreachable, bounds, rootIds, markAncestors };
