'use strict';

const crypto = require('crypto');
const { canonicalJson } = require('./durableJson');

const TRANSITIONS = { active: ['retained', 'quarantined', 'purged'], retained: ['quarantined', 'purged'],
  quarantined: ['retained', 'purged'], purged: [] };

function assertReplayMatches(existing, input) {
  if (existing.kind !== input.kind) throw new Error('artefact-idempotence-conflit');
  if (existing.content_hash !== (input.contentHash || null)) throw new Error('artefact-idempotence-conflit');
}

async function registerArtifact(db, input) {
  const existing = await db.get(`SELECT * FROM ontogenesis_artifacts
    WHERE project_id = ? AND path = ?`, [input.projectId, input.path]);
  if (existing) {
    assertReplayMatches(existing, input);
    return existing;
  }
  const id = input.id || `onto_art_${crypto.randomUUID()}`;
  await db.run(`INSERT INTO ontogenesis_artifacts
    (id, project_id, operation_id, kind, path, content_hash, retention_class,
      legal_hold, purge_after, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, input.projectId, input.operationId || null, input.kind, input.path, input.contentHash || null,
    input.retentionClass || 'operational', input.legalHold ? 1 : 0, input.purgeAfter || null,
    canonicalJson(input.metadata)]);
  return db.get('SELECT * FROM ontogenesis_artifacts WHERE id = ?', [id]);
}

async function transitionArtifact(db, input) {
  const row = await db.get('SELECT * FROM ontogenesis_artifacts WHERE id = ?', [input.artifactId]);
  if (!row) throw new Error('artefact-introuvable');
  if (input.state === 'purged' && row.legal_hold) throw new Error('artefact-sous-gel-juridique');
  if (!TRANSITIONS[row.state].includes(input.state)) throw new Error('transition-artefact-invalide');
  const info = await db.run(`UPDATE ontogenesis_artifacts SET state = ?, updated_at = datetime('now')
    WHERE id = ? AND state = ?`, [input.state, row.id, row.state]);
  if (info.changes !== 1) throw new Error('artefact-modifie-concurremment');
  return db.get('SELECT * FROM ontogenesis_artifacts WHERE id = ?', [row.id]);
}

module.exports = { registerArtifact, transitionArtifact };
