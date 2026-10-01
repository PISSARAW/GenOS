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

async function listFailures(db, projectId) {
  return listMemories(db, projectId, 'failure');
}

module.exports = { MEMORY_KINDS, isMemoryKind, recordMemory, listMemories, listFailures };
