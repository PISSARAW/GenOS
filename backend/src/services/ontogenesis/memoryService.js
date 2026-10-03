'use strict';

const crypto = require('crypto');

/**
 * Mémoire continue avec provenance (ADR 0235 §7).
 * Préférences, décisions, contraintes, échecs, questions ouvertes.
 */

const MEMORY_KINDS = ['preference', 'decision', 'constraint', 'failure', 'question'];

function isMemoryKind(kind) {
  return MEMORY_KINDS.includes(kind);
}

async function recordMemory(db, entry) {
  if (!isMemoryKind(entry.kind)) throw new Error('memory-kind-invalide');
  const id = entry.id || `mem_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO ontogenesis_memory (id, project_id, kind, content, provenance_json)
     VALUES (?, ?, ?, ?, ?)`,
    [id, entry.projectId, entry.kind, entry.content || '', JSON.stringify(entry.provenance || {})]
  );
  return id;
}

async function listMemories(db, projectId, kind) {
  if (kind) {
    return db.all(
      `SELECT * FROM ontogenesis_memory WHERE project_id = ? AND kind = ? ORDER BY created_at ASC`,
      [projectId, kind]
    );
  }
  return db.all(
    `SELECT * FROM ontogenesis_memory WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId]
  );
}

const SIMILARITY_THRESHOLD = 0.5;
const SIMILARITY_LIMIT = 2;

function tokenize(text) {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9\u00e0-\u00ff_-]+/g);
  return new Set(tokens || []);
}

function similarity(left, right) {
  const a = tokenize(left);
  const b = tokenize(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / union.size;
}

function countSimilarFailures(failures, text) {
  return (failures || []).filter((failure) => similarity(failure.content, text) >= SIMILARITY_THRESHOLD).length;
}

async function listSimilarFailures(db, query) {
  const failures = await listMemories(db, query.projectId, 'failure');
  return failures.filter((failure) => similarity(failure.content, query.text) >= SIMILARITY_THRESHOLD);
}

async function listFailures(db, projectId) {
  return listMemories(db, projectId, 'failure');
}

module.exports = { MEMORY_KINDS, SIMILARITY_THRESHOLD, SIMILARITY_LIMIT, isMemoryKind, recordMemory, listMemories, listFailures, tokenize, similarity, countSimilarFailures, listSimilarFailures };
