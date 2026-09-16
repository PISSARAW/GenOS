'use strict';

/**
 * Ontology Attributes — Essential vs Accidental Properties.
 */

const { getDatabase } = require('../db');

const ATTRIBUTE_MODALITIES = ['essential', 'accidental'];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

function serializeValue(value) {
  if (value === null || value === undefined) return { json: 'null', type: 'json' };
  const type = typeof value;
  if (type === 'string') return { json: JSON.stringify(value), type: 'string' };
  if (type === 'number') return { json: String(value), type: 'number' };
  if (type === 'boolean') return { json: String(value), type: 'boolean' };
  return { json: JSON.stringify(value), type: 'json' };
}

function deserializeValue(json, type) {
  if (type === 'string') return JSON.parse(json);
  if (type === 'number') return Number(json);
  if (type === 'boolean') return json === 'true';
  return JSON.parse(json);
}

function validateSetAttributeInput(data) {
  if (!data.agentId || typeof data.agentId !== 'string') {
    throw new Error('ontologyAttributes.setAttribute requires a valid agentId');
  }
  if (!data.key || typeof data.key !== 'string') {
    throw new Error('ontologyAttributes.setAttribute requires a valid key');
  }
  if (!ATTRIBUTE_MODALITIES.includes(data.modality)) {
    throw new Error(`Invalid modality: ${data.modality}. Must be 'essential' or 'accidental'`);
  }
}

async function getPreviousAttribute(db, agentId, key) {
  return db.get(
    'SELECT value_json, value_type FROM ontology_attributes WHERE being_id = ? AND key = ? AND valid_until IS NULL ORDER BY valid_from DESC LIMIT 1',
    agentId, key
  );
}

async function closePreviousAttribute(db, agentId, key) {
  await db.run(
    'UPDATE ontology_attributes SET valid_until = CURRENT_TIMESTAMP WHERE being_id = ? AND key = ? AND valid_until IS NULL',
    agentId, key
  );
}

async function insertNewAttribute(db, data) {
  await db.run(
    `INSERT INTO ontology_attributes (being_id, key, value_json, value_type, modality, provenance, previous_value_json, changed_at, valid_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    data.agentId, data.key, data.valueJson, data.valueType, data.modality, data.provenance, data.previousValueJson
  );
}

async function insertAttributeHistory(db, data) {
  await db.run(
    `INSERT INTO ontology_attribute_history (being_id, key, old_value_json, new_value_json, modality, changed_by, change_reason, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    data.agentId, data.key, data.oldValueJson, data.newValueJson, data.modality, data.changedBy, data.changeReason
  );
}

async function setAttribute(data) {
  const { agentId, key, value, modality = 'accidental', provenance = 'ontological' } = data;

  validateSetAttributeInput({ agentId, key, modality });

  const db = await getDb();
  const { ensureBeingExists } = require('./ontologyCore');
  await ensureBeingExists(agentId);

  const { json: valueJson, type: valueType } = serializeValue(value);
  const previous = await getPreviousAttribute(db, agentId, key);

  const previousValueJson = previous?.value_json ?? null;
  const previousValueType = previous?.value_type ?? null;

  if (previous) {
    await closePreviousAttribute(db, agentId, key);
  }

  await insertNewAttribute(db, { agentId, key, valueJson, valueType, modality, provenance, previousValueJson });

  await insertAttributeHistory(db, { agentId, key, oldValueJson: previousValueJson, newValueJson: valueJson, modality, changedBy: provenance, changeReason: `Set ${key} = ${valueJson}` });

  return {
    key,
    value: deserializeValue(valueJson, valueType),
    previousValue: previousValueJson ? deserializeValue(previousValueJson, previousValueType) : null,
    modality,
    provenance,
    changedAt: new Date().toISOString()
  };
}

async function getAttributes(agentId) {
  const db = await getDb();
  const rows = await db.all(
    'SELECT * FROM ontology_attributes WHERE being_id = ? AND valid_until IS NULL ORDER BY key',
    agentId
  );
  const attrs = {};
  for (const row of rows) {
    attrs[row.key] = {
      key: row.key,
      value: deserializeValue(row.value_json, row.value_type),
      modality: row.modality,
      provenance: row.provenance,
      changedAt: row.changed_at,
      validFrom: row.valid_from
    };
  }
  return attrs;
}

async function getAttribute(agentId, key) {
  const attrs = await getAttributes(agentId);
  return attrs[key] || null;
}

async function getAttributeHistory(agentId, options = {}) {
  const key = options.key || null;
  const limit = options.limit || 100;

  const db = await getDb();
  let sql = 'SELECT * FROM ontology_attribute_history WHERE being_id = ?';
  const params = [agentId];
  if (key) {
    sql += ' AND key = ?';
    params.push(key);
  }
  sql += ' ORDER BY changed_at DESC LIMIT ?';
  params.push(limit);
  const rows = await db.all(sql, ...params);
  return rows.map(r => ({
    key: r.key,
    oldValue: r.old_value_json ? deserializeValue(r.old_value_json, 'json') : null,
    newValue: deserializeValue(r.new_value_json, 'json'),
    modality: r.modality,
    changedBy: r.changed_by,
    changeReason: r.change_reason,
    changedAt: r.changed_at
  }));
}

module.exports = {
  setAttribute,
  getAttributes,
  getAttribute,
  getAttributeHistory,
  serializeValue,
  deserializeValue,
  ATTRIBUTE_MODALITIES
};