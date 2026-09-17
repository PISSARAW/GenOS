'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { CONCEPT_DEFINITIONS } = require('../philosophy/conceptDefinitions');

const MAX_JSON_LENGTH = 1024 * 1024;
const CONCEPT_IDS = new Set(CONCEPT_DEFINITIONS.map((concept) => concept.id));

function requiredConcept(value) {
  const conceptId = String(value || '').trim();
  if (!CONCEPT_IDS.has(conceptId)) throw new Error(`Unknown philosophical concept '${conceptId}'.`);
  return conceptId;
}

function json(value, field) {
  const serialized = JSON.stringify(value === undefined ? {} : value);
  if (serialized.length > MAX_JSON_LENGTH) throw new Error(`${field} exceeds the 1 MiB persistence limit.`);
  return serialized;
}

function decode(row) {
  return {
    id: row.id,
    conceptId: row.concept_id,
    input: JSON.parse(row.input_json),
    result: JSON.parse(row.result_json),
    provenance: JSON.parse(row.provenance_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function saveAnalysis(args = {}) {
  const conceptId = requiredConcept(args.conceptId || args.concept);
  const id = String(args.analysisId || crypto.randomUUID()).trim();
  if (!id) throw new Error('analysisId must be a non-empty string.');
  const input = json(args.input, 'input');
  const result = json(args.result, 'result');
  const provenance = json(args.provenance || { source: 'genos_philosophy' }, 'provenance');
  const db = await getDatabase();
  await db.run(
    `INSERT INTO philosophy_analyses
      (id, concept_id, input_json, result_json, provenance_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       concept_id = excluded.concept_id,
       input_json = excluded.input_json,
       result_json = excluded.result_json,
       provenance_json = excluded.provenance_json,
       updated_at = CURRENT_TIMESTAMP`,
    id, conceptId, input, result, provenance, args.createdBy || null
  );
  return getAnalysis({ analysisId: id });
}

async function getAnalysis(args = {}) {
  const id = String(args.analysisId || args.id || '').trim();
  if (!id) throw new Error('analysisId is required.');
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM philosophy_analyses WHERE id = ?', id);
  return row ? decode(row) : null;
}

async function listAnalyses(args = {}) {
  const db = await getDatabase();
  const conceptId = args.conceptId ? requiredConcept(args.conceptId) : null;
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
  const rows = conceptId
    ? await db.all('SELECT * FROM philosophy_analyses WHERE concept_id = ? ORDER BY created_at DESC LIMIT ?', conceptId, limit)
    : await db.all('SELECT * FROM philosophy_analyses ORDER BY created_at DESC LIMIT ?', limit);
  return rows.map(decode);
}

module.exports = { saveAnalysis, getAnalysis, listAnalyses };
