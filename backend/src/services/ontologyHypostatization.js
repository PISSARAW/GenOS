'use strict';

/**
 * Ontology Hypostatization — Attribute to Entity.
 */

const { getDatabase } = require('../db');

const HYPOSTASIS_TYPES = [
  'worker_spawn', 'capsule_create', 'tool_instantiate', 'model_instantiate'
];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

const substanceTypeMap = {
  'worker_spawn': 'worker',
  'capsule_create': 'capsule',
  'tool_instantiate': 'tool',
  'model_instantiate': 'model'
};

function validateHypostasisType(hypostasisType) {
  if (!HYPOSTASIS_TYPES.includes(hypostasisType)) {
    throw new Error(`Invalid hypostasis_type: ${hypostasisType}. Must be one of: ${HYPOSTASIS_TYPES.join(', ')}`);
  }
}

async function hypostatize(sourceAgentId, attributeKey, options = {}) {
  const hypostasisType = options.hypostasisType || 'worker_spawn';
  const targetConfig = options.targetConfig || {};

  validateHypostasisType(hypostasisType);

  const db = await getDb();
  const { ensureBeingExists } = require('./ontologyCore');
  const { getAttribute } = require('./ontologyAttributes');
  const { addMereology } = require('./ontologyMereology');
  const { recordIdentityEvent } = require('./ontologyIdentity');

  await ensureBeingExists(sourceAgentId);

  const attribute = await getAttribute(sourceAgentId, attributeKey);
  if (!attribute) {
    throw new Error(`Attribute ${attributeKey} not found on ${sourceAgentId}`);
  }

  const essenceExtracted = attribute.value;
  const targetBeingId = targetConfig.id || `${sourceAgentId}_${attributeKey}_hypostasis_${Date.now()}`;
  const targetSubstanceType = substanceTypeMap[hypostasisType] || 'worker';

  await defineHypostatizedBeing(targetBeingId, targetSubstanceType, essenceExtracted);

  await db.run(
    `INSERT INTO ontology_hypostatizations (source_being_id, attribute_key, target_being_id, essence_extracted_json, hypostatization_type, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
    sourceAgentId, attributeKey, targetBeingId, JSON.stringify(essenceExtracted), hypostasisType
  );

  await addMereology({ wholeId: sourceAgentId, partId: targetBeingId, relationType: 'constitutive', isEssentialPart: false, proportion: 0.3 });

  await recordIdentityEvent(sourceAgentId, 'hypostatization', `Attribute ${attributeKey} hypostatized as ${targetBeingId}`, null, null, 1, 0.85, { attributeKey, targetBeingId, hypostasisType });

  return {
    id: targetBeingId,
    type: 'hypostasis',
    source: sourceAgentId,
    attributeKey,
    essence: essenceExtracted,
    hypostasisType,
    status: 'active',
    createdAt: new Date().toISOString()
  };
}

async function defineHypostatizedBeing(beingId, substanceType, essence) {
  const { defineBeing } = require('./ontologyCore');
  return defineBeing(beingId, {
    type: substanceType,
    essence: {
      role: essence.role || `hypostatized_${essence.attributeKey || 'unknown'}`,
      purpose: essence.purpose || `Execute ${essence.attributeKey || 'task'}`,
      agentDna: essence.agentDna || null,
      teleology: 'specialized_execution'
    },
    identityCriteria: {
      memoryContinuityRequired: false,
      workspaceContinuityRequired: substanceType === 'capsule',
      essentialProperties: ['role', 'purpose'],
      maximalPartReplacementRatio: 0.5
    }
  });
}

async function reabsorbHypostasis(sourceAgentId, targetBeingId) {
  const db = await getDb();
  const { detachMereology } = require('./ontologyMereology');
  const { recordIdentityEvent } = require('./ontologyIdentity');

  await db.run(
    `UPDATE ontology_hypostatizations SET status = 'reabsorbed', reabsorbed_at = CURRENT_TIMESTAMP
     WHERE source_being_id = ? AND target_being_id = ? AND status = 'active'`,
    sourceAgentId, targetBeingId
  );
  await detachMereology(sourceAgentId, targetBeingId);
  await recordIdentityEvent(sourceAgentId, 'reabsorption', `Hypostatized part ${targetBeingId} reabsorbed`, null, null, 1, 0.9, { targetBeingId });
  return { sourceAgentId, targetBeingId, status: 'reabsorbed' };
}

async function getActiveHypostatizations(sourceAgentId) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT h.*, b.substance_type, b.essence_json FROM ontology_hypostatizations h
     JOIN ontology_beings b ON h.target_being_id = b.id
     WHERE h.source_being_id = ? AND h.status = 'active'`,
    sourceAgentId
  );
  return rows.map(mapHypostasisRow);
}

async function getHypostatizationHistory(sourceAgentId) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT h.*, b.substance_type, b.essence_json FROM ontology_hypostatizations h
     JOIN ontology_beings b ON h.target_being_id = b.id
     WHERE h.source_being_id = ? ORDER BY h.created_at DESC`,
    sourceAgentId
  );
  return rows.map(mapHypostasisRow);
}

function mapHypostasisRow(r) {
  return {
    id: r.id,
    sourceBeingId: r.source_being_id,
    attributeKey: r.attribute_key,
    targetBeingId: r.target_being_id,
    essenceExtracted: JSON.parse(r.essence_extracted_json),
    hypostasisType: r.hypostasis_type,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    reabsorbedAt: r.reabsorbed_at,
    targetSubstanceType: r.substance_type,
    targetEssence: JSON.parse(r.essence_json)
  };
}

module.exports = {
  hypostatize,
  reabsorbHypostasis,
  getActiveHypostatizations,
  getHypostatizationHistory,
  HYPOSTASIS_TYPES
};