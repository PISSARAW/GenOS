'use strict';

const crypto = require('crypto');

/**
 * Compaction de la mémoire continue (roadmap §P4).
 * Au-delà du seuil, les entrées les plus anciennes sont remplacées
 * par un résumé extractif déterministe : comptes par kind, dernier
 * élément de chaque kind, plage temporelle. Les décisions avec
 * preuves exécutables ne sont jamais compactées sans trace : le
 * résumé cite leurs identifiants.
 */

const DEFAULT_KEEP_LAST = 50;
const EXCERPT_LENGTH = 120;

function excerptOf(content) {
  return String(content || '').slice(0, EXCERPT_LENGTH);
}

function groupByKind(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.kind)) groups.set(entry.kind, []);
    groups.get(entry.kind).push(entry);
  }
  return groups;
}

function describeGroup(kind, rows) {
  const latest = rows[rows.length - 1];
  return `${kind}: ${rows.length} entree(s), derniere [${latest.id}] ${excerptOf(latest.content)}`;
}

function summarizeEntries(entries) {
  const rows = entries || [];
  if (rows.length === 0) return null;
  const groups = groupByKind(rows);
  const lines = [];
  for (const [kind, group] of groups) lines.push(describeGroup(kind, group));
  return {
    content: `resume-memoire (${rows.length} entrees):\n${lines.join('\n')}`,
    coversFrom: rows[0].created_at || null,
    coversTo: rows[rows.length - 1].created_at || null,
    count: rows.length
  };
}

async function readMemories(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_memory WHERE project_id = ? ORDER BY created_at ASC, rowid ASC`,
    [projectId]
  );
}

async function storeSummary(db, projectId, summary) {
  const id = `sum_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO ontogenesis_summaries (id, project_id, content, covers_from, covers_to, entry_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, projectId, summary.content, summary.coversFrom, summary.coversTo, summary.count]
  );
  return id;
}

async function removeEntries(db, entries) {
  for (const entry of entries) {
    await db.run('DELETE FROM ontogenesis_memory WHERE id = ?', [entry.id]);
  }
}

async function compactMemory(db, input) {
  const keep = input.keepLastN === undefined ? DEFAULT_KEEP_LAST : input.keepLastN;
  const rows = await readMemories(db, input.projectId);
  if (rows.length <= keep) return { compacted: false, entries: rows.length };
  const aged = rows.slice(0, rows.length - keep);
  const summary = summarizeEntries(aged);
  const summaryId = await storeSummary(db, input.projectId, summary);
  await removeEntries(db, aged);
  return { compacted: true, summaryId, archived: aged.length, remaining: keep };
}

module.exports = { DEFAULT_KEEP_LAST, summarizeEntries, compactMemory };
