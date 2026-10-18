'use strict';

const { getDatabase, withTransaction } = require('../../db');
const calibration = require('./memoryCalibrationService');

const MAX_ENTRIES = 1024;

function scopeFor(input = {}) {
  const organizationId = input.organizationId || null;
  const projectId = input.projectId || null;
  if (Boolean(organizationId) !== Boolean(projectId)) {
    throw new Error('organizationId and projectId must be provided together.');
  }
  const scopeKey = organizationId ? JSON.stringify([organizationId, projectId]) : 'global';
  return { scopeKey, organizationId, projectId };
}

function boundedUnit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function parseMemory(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

async function database(dbOverride) {
  return dbOverride || getDatabase();
}

async function pruneAncestral(db, identity) {
  await db.run(`DELETE FROM ancestral_memories WHERE scope_key = ? AND lineage_id = ?
    AND memory_id IN (SELECT memory_id FROM ancestral_memories
      WHERE scope_key = ? AND lineage_id = ?
      ORDER BY salience DESC, updated_at DESC LIMIT -1 OFFSET ?)`,
  identity.scopeKey, identity.lineageId, identity.scopeKey, identity.lineageId, MAX_ENTRIES);
}

async function memorize(input = {}, dbOverride = null) {
  if (!input.lineageId || !input.memoryId || !input.ancestorId) return false;
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const now = new Date().toISOString();
  await withTransaction(db, async (tx) => {
    await tx.run(`INSERT INTO ancestral_memories
      (scope_key, lineage_id, memory_id, ancestor_id, memory_json, salience,
       organization_id, project_id, recorded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_key, lineage_id, memory_id) DO UPDATE SET
       ancestor_id = excluded.ancestor_id, memory_json = excluded.memory_json,
       salience = excluded.salience, updated_at = excluded.updated_at`,
    scope.scopeKey, input.lineageId, input.memoryId, input.ancestorId,
    JSON.stringify(input.memory || {}), boundedUnit(input.salience, 0.5),
    scope.organizationId, scope.projectId, now, now);
    await pruneAncestral(tx, { ...scope, lineageId: input.lineageId });
  });
  return true;
}

async function recall(input = {}, dbOverride = null) {
  if (!input.lineageId) return [];
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const rows = await db.all(`SELECT * FROM ancestral_memories
    WHERE scope_key = ? AND lineage_id = ?
    ORDER BY salience DESC, updated_at DESC LIMIT ?`, scope.scopeKey, input.lineageId, MAX_ENTRIES);
  return rows.map((row) => ({ memoryId: row.memory_id, lineageId: row.lineage_id,
    ancestorId: row.ancestor_id, memory: parseMemory(row.memory_json), salience: row.salience,
    recordedAt: row.recorded_at, updatedAt: row.updated_at }));
}

async function forget(input = {}, dbOverride = null) {
  if (!input.lineageId || !input.memoryId) return 0;
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const result = await db.run(`DELETE FROM ancestral_memories
    WHERE scope_key = ? AND lineage_id = ? AND memory_id = ?`,
  scope.scopeKey, input.lineageId, input.memoryId);
  return result.changes || 0;
}

async function ancestralStats(input = {}, dbOverride = null) {
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const row = await db.get(`SELECT COUNT(*) AS total, COUNT(DISTINCT lineage_id) AS lineages
    FROM ancestral_memories WHERE scope_key = ?`, scope.scopeKey);
  return { total: row?.total || 0, lineages: row?.lineages || 0,
    maxEntries: MAX_ENTRIES, persistence: 'sqlite' };
}

function riskIdentity(input) {
  const profile = calibration.runtimeProfile();
  const attenuation = boundedUnit(input.attenuation,
    calibration.threshold('ancestralRiskAttenuation'));
  const depth = Math.max(0, Number.isSafeInteger(input.depth) ? input.depth : 0);
  const risk = boundedUnit(input.risk, 0) * Math.pow(attenuation, depth);
  return { profile, attenuation, depth, risk };
}

async function pruneRisks(db, identity) {
  await db.run(`DELETE FROM inherited_risks WHERE scope_key = ? AND lineage_id = ?
    AND target_id IN (SELECT target_id FROM inherited_risks
      WHERE scope_key = ? AND lineage_id = ?
      ORDER BY risk DESC, updated_at DESC LIMIT -1 OFFSET ?)`,
  identity.scopeKey, identity.lineageId, identity.scopeKey, identity.lineageId, MAX_ENTRIES);
}

async function propagateRisk(input = {}, dbOverride = null) {
  if (!input.lineageId || !input.sourceId || !input.targetId || !Number.isFinite(input.risk)) return false;
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const inherited = riskIdentity(input);
  const now = new Date().toISOString();
  await withTransaction(db, async (tx) => {
    await tx.run(`INSERT INTO inherited_risks
      (scope_key, lineage_id, target_id, source_id, risk, depth, attenuation,
       calibration_version, calibration_status, organization_id, project_id, inherited_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_key, lineage_id, target_id) DO UPDATE SET
       source_id = excluded.source_id, risk = excluded.risk, depth = excluded.depth,
       attenuation = excluded.attenuation, calibration_version = excluded.calibration_version,
       calibration_status = excluded.calibration_status, updated_at = excluded.updated_at`,
    scope.scopeKey, input.lineageId, input.targetId, input.sourceId, inherited.risk,
    inherited.depth, inherited.attenuation, inherited.profile.version, inherited.profile.status,
    scope.organizationId, scope.projectId, now, now);
    await pruneRisks(tx, { ...scope, lineageId: input.lineageId });
  });
  return true;
}

async function getRisk(input = {}, dbOverride = null) {
  if (!input.lineageId || !input.targetId) return null;
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const row = await db.get(`SELECT * FROM inherited_risks
    WHERE scope_key = ? AND lineage_id = ? AND target_id = ?`,
  scope.scopeKey, input.lineageId, input.targetId);
  if (!row) return null;
  return { agentId: row.target_id, sourceId: row.source_id, risk: row.risk,
    depth: row.depth, attenuation: row.attenuation, inheritedAt: row.inherited_at,
    calibration: { version: row.calibration_version, status: row.calibration_status },
    persistence: 'sqlite' };
}

async function decayRisks(input = {}, dbOverride = null) {
  if (!input.lineageId || !Number.isFinite(input.factor) || input.factor < 0 || input.factor > 1) return 0;
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const result = await db.run(`UPDATE inherited_risks SET risk = risk * ?, updated_at = ?
    WHERE scope_key = ? AND lineage_id = ?`, input.factor, new Date().toISOString(),
  scope.scopeKey, input.lineageId);
  return result.changes || 0;
}

async function riskStats(input = {}, dbOverride = null) {
  const db = await database(dbOverride);
  const scope = scopeFor(input);
  const row = await db.get(`SELECT COUNT(*) AS total, COUNT(DISTINCT lineage_id) AS lineages
    FROM inherited_risks WHERE scope_key = ?`, scope.scopeKey);
  return { total: row?.total || 0, lineages: row?.lineages || 0,
    maxEntries: MAX_ENTRIES, attenuation: calibration.threshold('ancestralRiskAttenuation'),
    calibration: calibration.runtimeProfile(), persistence: 'sqlite' };
}

module.exports = { memorize, recall, forget, ancestralStats,
  propagateRisk, getRisk, decayRisks, riskStats, scopeFor, MAX_ENTRIES };
