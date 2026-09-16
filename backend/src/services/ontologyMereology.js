'use strict';

/**
 * Ontology Mereology — Part-Whole Relations.
 */

const { getDatabase } = require('../db');

const MEREOLOGY_TYPES = [
  'constitutive', 'spatial', 'functional', 'temporal', 'informational', 'genetic'
];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

function validateRelationType(relationType) {
  if (!MEREOLOGY_TYPES.includes(relationType)) {
    throw new Error(`Invalid relation_type: ${relationType}. Must be one of: ${MEREOLOGY_TYPES.join(', ')}`);
  }
}

async function addMereology(data) {
  const { wholeId, partId, relationType, isEssentialPart = false, proportion = null } = data;
  validateRelationType(relationType);

  const db = await getDb();
  const { ensureBeingExists } = require('./ontologyCore');
  await ensureBeingExists(wholeId);
  await ensureBeingExists(partId);

  await db.run(
    `INSERT INTO ontology_mereology (whole_id, part_id, relation_type, is_essential_part, proportion, attached_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    wholeId, partId, relationType, isEssentialPart ? 1 : 0, proportion
  );

  return { wholeId, partId, relationType, isEssentialPart: Boolean(isEssentialPart), proportion };
}

async function detachMereology(wholeId, partId) {
  const db = await getDb();
  await db.run(
    `UPDATE ontology_mereology SET detached_at = CURRENT_TIMESTAMP WHERE whole_id = ? AND part_id = ? AND detached_at IS NULL`,
    wholeId, partId
  );
}

async function getParts(wholeId) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT m.*, b.substance_type, b.essence_json FROM ontology_mereology m
     JOIN ontology_beings b ON m.part_id = b.id
     WHERE m.whole_id = ? AND m.detached_at IS NULL`,
    wholeId
  );
  return rows.map(mapMereologyRow);
}

async function getWholes(partId) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT m.*, b.substance_type, b.essence_json FROM ontology_mereology m
     JOIN ontology_beings b ON m.whole_id = b.id
     WHERE m.part_id = ? AND m.detached_at IS NULL`,
    partId
  );
  return rows.map(mapMereologyRow);
}

function mapMereologyRow(r) {
  return {
    partId: r.part_id,
    wholeId: r.whole_id,
    relationType: r.relation_type,
    isEssentialPart: Boolean(r.is_essential_part),
    proportion: r.proportion,
    attachedAt: r.attached_at,
    substanceType: r.substance_type,
    essence: JSON.parse(r.essence_json)
  };
}

async function getEssentialParts(wholeId) {
  const parts = await getParts(wholeId);
  return parts.filter(p => p.isEssentialPart);
}

async function getConstitutiveParts(wholeId) {
  const parts = await getParts(wholeId);
  return parts.filter(p => p.relationType === 'constitutive');
}

module.exports = {
  addMereology,
  detachMereology,
  getParts,
  getWholes,
  getEssentialParts,
  getConstitutiveParts,
  MEREOLOGY_TYPES
};