'use strict';

function tokenize(text) {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9\u00e0-\u00ff_-]+/g);
  return new Set(tokens || []);
}

function jaccard(left, right) {
  const a = tokenize(left);
  const b = tokenize(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / union.size;
}

function tagCredibility(entry) {
  const author = String((entry && entry.author) || '').toLowerCase();
  const systemAuthors = new Set(['memory_seed', 'system', 'ontogenesis']);
  const humanAuthors = new Set(['user', 'human', 'operator']);
  if (systemAuthors.has(author)) return { multiplier: 1.2, tag: 'verified-system-fact' };
  if (humanAuthors.has(author)) return { multiplier: 0.95, tag: 'human-source' };
  return { multiplier: 1.0, tag: 'neutral-source' };
}

async function syncFts(db, projectId) {
  try {
    const rows = await db.all(
      `SELECT id, kind, content FROM ontogenesis_memory WHERE project_id = ?`,
      [projectId]
    );
    await db.run(`DELETE FROM ontogenesis_memory_fts WHERE project_id = ?`, [projectId]);
    for (const row of rows) {
      await db.run(
        `INSERT INTO ontogenesis_memory_fts (memory_id, project_id, kind, content) VALUES (?, ?, ?, ?)`,
        [row.id, projectId, row.kind, row.content || '']
      );
    }
  } catch (error) {
    // FTS5 may be unavailable; callers fall back to token similarity.
  }
}

async function fetchFtsRows(db, input) {
  const projectId = input.projectId;
  const text = input.text;
  const limit = input.limit;
  let ftsRows = [];
  try {
    const match = text.replace(/[^a-zA-Z0-9\u00e0-\u00ff]/g, ' ').trim();
    if (match.length > 0) {
      const ftsMatch = match.split(/\s+/).map((w) => `"${w}"`).join(' OR ');
      ftsRows = await db.all(
        `SELECT memory_id, rank FROM ontogenesis_memory_fts WHERE ontogenesis_memory_fts MATCH ? AND project_id = ? ORDER BY rank LIMIT ?`,
        [ftsMatch, projectId, limit * 4]
      );
    }
  } catch (error) {
    ftsRows = [];
  }
  return ftsRows;
}

function authorFromRow(row) {
  try {
    const prov = JSON.parse(row.provenance_json || '{}');
    return prov.author || prov.source || '';
  } catch (e) {
    return '';
  }
}

function scoreMemoryRows(all, ftsScore, text) {
  return all.map((row) => {
    const author = authorFromRow(row);
    const sim = jaccard(row.content, text);
    const cred = tagCredibility({ author: author });
    const fts = ftsScore.get(row.id) || 0;
    const hybrid = fts * 0.6 + sim * 0.4;
    const finalScore = hybrid * cred.multiplier;
    return {
      ...row,
      similarityScore: Number(finalScore.toFixed(4)),
      credibilityTag: cred.tag,
    };
  });
}

async function searchMemories(db, query) {
  const projectId = query.projectId;
  const text = String(query.text || '');
  const limit = Number(query.limit || 5);
  await syncFts(db, projectId);

  const ftsRows = await fetchFtsRows(db, { projectId: projectId, text: text, limit: limit });

  const all = await db.all(
    `SELECT * FROM ontogenesis_memory WHERE project_id = ?`,
    [projectId]
  );

  const ftsScore = new Map();
  for (const row of ftsRows) {
    ftsScore.set(row.memory_id, 1.0 / (1.0 + Math.abs(Number(row.rank || 0))));
  }

  const scored = scoreMemoryRows(all, ftsScore, text);
  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, limit);
}

async function temporalContext(db, projectId, anchorId) {
  const anchor = await db.get(
    `SELECT * FROM ontogenesis_memory WHERE project_id = ? AND id = ?`,
    [projectId, anchorId]
  );
  if (!anchor) return { previous: null, next: null };

  const previous = await db.get(
    `SELECT * FROM ontogenesis_memory WHERE project_id = ? AND created_at < ? AND id != ? ORDER BY created_at DESC LIMIT 1`,
    [projectId, anchor.created_at, anchorId]
  );
  const next = await db.get(
    `SELECT * FROM ontogenesis_memory WHERE project_id = ? AND created_at > ? AND id != ? ORDER BY created_at ASC LIMIT 1`,
    [projectId, anchor.created_at, anchorId]
  );
  return { previous: previous || null, next: next || null };
}

async function graphNeighbors(db, input) {
  const projectId = input.projectId;
  const ids = input.ids;
  const depth = input.depth;
  const maxDepth = Math.min(Number(depth || 2), 4);
  const seeds = new Set(Array.isArray(ids) ? ids : [ids]);
  const result = new Set();
  let frontier = Array.isArray(ids) ? ids.slice() : [ids];
  for (let level = 0; level < maxDepth; level += 1) {
    if (frontier.length === 0) break;
    const placeholders = frontier.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT target_id AS id FROM ontogenesis_memory_synapses
       WHERE project_id = ? AND source_id IN (${placeholders})
       UNION
       SELECT source_id AS id FROM ontogenesis_memory_synapses
       WHERE project_id = ? AND target_id IN (${placeholders})`,
      [projectId, ...frontier, projectId, ...frontier]
    );
    const next = [];
    for (const row of rows) {
      if (seeds.has(row.id)) continue;
      if (!result.has(row.id)) {
        result.add(row.id);
        next.push(row.id);
      }
    }
    frontier = next;
  }
  return Array.from(result);
}

async function sleepCycle(db, projectId) {
  await db.run(
    `UPDATE ontogenesis_memory_synapses SET weight = MAX(0.1, weight * 0.9), updated_at = datetime('now')
     WHERE project_id = ?`,
    [projectId]
  );
  await db.run(
    `DELETE FROM ontogenesis_memory_synapses WHERE project_id = ? AND ABS(weight) < 0.1`,
    [projectId]
  );
  return { decayed: true };
}

function listSimilarFailuresFallback(failures, text, threshold) {
  return (failures || []).filter((failure) => jaccard(failure.content, text) >= threshold);
}

module.exports = {
  tokenize,
  jaccard,
  tagCredibility,
  searchMemories,
  temporalContext,
  graphNeighbors,
  sleepCycle,
  listSimilarFailuresFallback,
};