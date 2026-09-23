'use strict';

/**
 * Finding Evidence Service — ADR 0034 D6.
 *
 * Preuve typée : side (supporting|contradicting) × 6 natures
 * (observational, experimental, formal, causal, replicated,
 * adversarial). Chaque item référence un provenance_record
 * existant — jamais de preuve sans provenance traçable.
 * Aucune transition auto : l'interprétation appartient au
 * Verifier/Investigator (D8/D9), pas au stockage.
 */

const { migrateDaemonFindings } = require('../../../db/migrations/migrateDaemonFindings');

const SIDES = ['supporting', 'contradicting'];
const EVIDENCE_TYPES = ['observational', 'experimental', 'formal', 'causal', 'replicated', 'adversarial'];

function validateEvidenceInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['input-object-required'] };
  if (!input.findingId) errors.push('findingId-required');
  if (!SIDES.includes(input.side)) errors.push('invalid-side');
  if (!EVIDENCE_TYPES.includes(input.evidenceType)) errors.push('invalid-evidenceType');
  if (!input.description) errors.push('description-required');
  if (!input.provenanceRecordId) errors.push('provenanceRecordId-required');
  return { ok: errors.length === 0, errors };
}

async function appendEvidence(db, input) {
  const validation = validateEvidenceInput(input);
  if (!validation.ok) return { appended: false, errors: validation.errors };
  await migrateDaemonFindings(db);
  const finding = await db.get('SELECT id FROM daemon_findings WHERE id = ?', input.findingId);
  if (!finding) return { appended: false, errors: ['finding-not-found'] };
  const res = await db.run(
    `INSERT INTO daemon_finding_evidence
      (finding_id, side, evidence_type, description, provenance_record_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.findingId,
    input.side,
    input.evidenceType,
    input.description,
    input.provenanceRecordId,
    JSON.stringify(input.metadata || {})
  );
  return { appended: true, evidenceId: res && res.lastID };
}

async function listEvidence(db, query) {
  if (!db || !query || !query.findingId) return { supporting: [], contradicting: [] };
  await migrateDaemonFindings(db);
  const rows = await db.all(
    'SELECT * FROM daemon_finding_evidence WHERE finding_id = ? ORDER BY id ASC',
    query.findingId
  );
  return splitBySide(rows || []);
}

function splitBySide(rows) {
  const supporting = [];
  const contradicting = [];
  for (const row of rows) {
    const item = toEvidenceItem(row);
    if (row.side === 'supporting') supporting.push(item);
    else contradicting.push(item);
  }
  return { supporting, contradicting };
}

function toEvidenceItem(row) {
  return {
    id: row.id,
    evidenceType: row.evidence_type,
    description: row.description,
    provenanceRecordId: row.provenance_record_id,
    collectedAt: row.collected_at
  };
}

module.exports = {
  SIDES,
  EVIDENCE_TYPES,
  validateEvidenceInput,
  appendEvidence,
  listEvidence
};
