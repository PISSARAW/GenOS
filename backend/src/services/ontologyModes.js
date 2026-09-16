'use strict';

/**
 * Ontology Modes — Execution Modalities with Constraints.
 */

const { getDatabase } = require('../db');

const MODE_CONSTRAINTS = ['necessary', 'possible', 'impossible'];
const MODE_STATES = ['inactive', 'active', 'suspended', 'failed'];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

function validateModeInput(mode, constraint) {
  if (!mode || typeof mode !== 'string') {
    throw new Error('ontologyModes.defineMode requires a valid mode');
  }
  if (!MODE_CONSTRAINTS.includes(constraint)) {
    throw new Error(`Invalid constraint: ${constraint}. Must be one of: ${MODE_CONSTRAINTS.join(', ')}`);
  }
}

function validateModeExists(existing, mode, agentId) {
  if (!existing) throw new Error(`Mode ${mode} not defined for ${agentId}`);
  if (existing.mode_constraint === 'impossible') throw new Error(`Cannot activate impossible mode: ${mode}`);
}

async function defineMode(agentId, mode, options = {}) {
  const constraint = options.constraint || 'possible';
  const activationCondition = options.activationCondition || null;

  validateModeInput(mode, constraint);

  const db = await getDb();
  const { ensureBeingExists } = require('./ontologyCore');
  await ensureBeingExists(agentId);

  await db.run(
    `INSERT OR REPLACE INTO ontology_modes (being_id, mode, mode_constraint, state, activation_condition_json, updated_at)
     VALUES (?, ?, ?, 'inactive', ?, CURRENT_TIMESTAMP)`,
    agentId, mode, constraint, activationCondition ? JSON.stringify(activationCondition) : null
  );

  return getMode(agentId, mode);
}

async function activateMode(agentId, mode) {
  const db = await getDb();
  const existing = await db.get('SELECT * FROM ontology_modes WHERE being_id = ? AND mode = ?', agentId, mode);
  validateModeExists(existing, mode, agentId);

  await db.run(
    `UPDATE ontology_modes SET state = 'active', activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE being_id = ? AND mode = ?`,
    agentId, mode
  );
  return getMode(agentId, mode);
}

async function deactivateMode(agentId, mode, options = {}) {
  const reason = options.reason || null;
  const db = await getDb();
  await db.run(
    `UPDATE ontology_modes SET state = 'suspended', deactivated_at = CURRENT_TIMESTAMP, failure_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE being_id = ? AND mode = ?`,
    reason, agentId, mode
  );
  return getMode(agentId, mode);
}

async function failMode(agentId, mode, reason) {
  const db = await getDb();
  await db.run(
    `UPDATE ontology_modes SET state = 'failed', deactivated_at = CURRENT_TIMESTAMP, failure_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE being_id = ? AND mode = ?`,
    reason, agentId, mode
  );
  return getMode(agentId, mode);
}

async function getMode(agentId, mode) {
  const db = await getDb();
  const row = await db.get('SELECT * FROM ontology_modes WHERE being_id = ? AND mode = ?', agentId, mode);
  if (!row) return null;
  return {
    mode: row.mode,
    constraint: row.mode_constraint,
    state: row.state,
    activationCondition: row.activation_condition_json ? JSON.parse(row.activation_condition_json) : null,
    activatedAt: row.activated_at,
    deactivatedAt: row.deactivated_at,
    failureReason: row.failure_reason
  };
}

async function getModes(agentId) {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM ontology_modes WHERE being_id = ? ORDER BY mode', agentId);
  const modes = {};
  for (const row of rows) {
    modes[row.mode] = {
      mode: row.mode,
      constraint: row.mode_constraint,
      state: row.state,
      activationCondition: row.activation_condition_json ? JSON.parse(row.activation_condition_json) : null,
      activatedAt: row.activated_at,
      deactivatedAt: row.deactivated_at,
      failureReason: row.failure_reason
    };
  }
  return modes;
}

async function getActiveModes(agentId) {
  const modes = await getModes(agentId);
  return Object.values(modes).filter(m => m.state === 'active');
}

module.exports = {
  defineMode,
  activateMode,
  deactivateMode,
  failMode,
  getMode,
  getModes,
  getActiveModes,
  MODE_CONSTRAINTS,
  MODE_STATES
};