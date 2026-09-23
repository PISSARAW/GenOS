'use strict';

/**
 * Finding Service — ADR 0034 D6.
 *
 * CRUD + transitions du finding canonique. Règles :
 *  - limitations obligatoires (un finding sans limites sur-déclare) ;
 *  - statut initial OBSERVED ou HYPOTHESIZED uniquement ;
 *  - head_sha ancre la connaissance au commit observé ;
 *  - markStaleOnHead : tout finding vivant sur un HEAD dépassé
 *    passe STALE (sauf REFUTED/EXPIRED/STALE déjà).
 */

const { migrateDaemonFindings } = require('../../../db/migrations/migrateDaemonFindings');
const lifecycle = require('./findingLifecycleService');

const ID_PATTERN = /^finding\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TERRITORY_PATTERN = /^territory\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const CREATOR_PATTERN = /^(daemon|natural-search|orchestrator|worker|human)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateFindingInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['input-object-required'] };
  collectIdentityErrors(input, errors);
  collectContentErrors(input, errors);
  return { ok: errors.length === 0, errors };
}

function collectIdentityErrors(input, errors) {
  if (!ID_PATTERN.test(input.id || '')) errors.push('invalid-id');
  if (!TERRITORY_PATTERN.test(input.territoryId || '')) errors.push('invalid-territoryId');
  if (!SHA_PATTERN.test(input.headSha || '')) errors.push('invalid-headSha');
  if (!CREATOR_PATTERN.test(input.createdBy || '')) errors.push('invalid-createdBy');
}

function collectContentErrors(input, errors) {
  if (!input.claim || String(input.claim).length < 10) errors.push('claim-too-short');
  if (!input.scope || !input.scope.type || !input.scope.value) errors.push('scope-required');
  if (!Array.isArray(input.limitations) || input.limitations.length < 1) errors.push('limitations-required');
  if (input.status && !lifecycle.isInitial(input.status)) errors.push('invalid-initial-status');
}

function rowToFinding(row) {
  if (!row) return null;
  return {
    apiVersion: 'genos.daemon/v1',
    kind: 'DaemonFinding',
    id: row.id,
    territoryId: row.territory_id,
    claim: row.claim,
    scope: { type: row.scope_type, value: row.scope_value },
    headSha: row.head_sha,
    status: row.status,
    hypothesisId: row.hypothesis_id || null,
    detectorId: row.detector_id || null,
    createdBy: row.created_by,
    limitations: safeParseArray(row.limitations_json),
    provenanceRecordIds: safeParseArray(row.provenance_record_ids_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at || null
  };
}

function safeParseArray(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function createFinding(db, input) {
  const validation = validateFindingInput(input);
  if (!validation.ok) return { created: false, errors: validation.errors };
  await migrateDaemonFindings(db);
  const { migrateDaemonFindingDetector } = require('../../../db/migrations/migrateDaemonFindingDetector');
  await migrateDaemonFindingDetector(db);
  await db.run(
    `INSERT INTO daemon_findings
      (id, territory_id, claim, scope_type, scope_value, head_sha, status,
       hypothesis_id, detector_id, created_by, limitations_json, provenance_record_ids_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    input.id,
    input.territoryId,
    input.claim,
    input.scope.type,
    input.scope.value,
    input.headSha,
    input.status || 'OBSERVED',
    input.hypothesisId || null,
    input.detectorId || null,
    input.createdBy,
    JSON.stringify(input.limitations),
    JSON.stringify(input.provenanceRecordIds || []),
    input.expiresAt || null
  );
  return getFinding(db, { id: input.id });
}

async function getFinding(db, query) {
  if (!db || !query || !query.id) return { found: false };
  await migrateDaemonFindings(db);
  const row = await db.get('SELECT * FROM daemon_findings WHERE id = ?', query.id);
  if (!row) return { found: false };
  return { found: true, finding: rowToFinding(row) };
}

async function listFindings(db, filter) {
  if (!db) return [];
  await migrateDaemonFindings(db);
  const scoped = filter || {};
  if (scoped.status) {
    return rowsToFindings(await db.all(
      'SELECT * FROM daemon_findings WHERE territory_id = ? AND status = ? ORDER BY updated_at DESC',
      scoped.territoryId,
      scoped.status
    ));
  }
  return rowsToFindings(await db.all(
    'SELECT * FROM daemon_findings WHERE territory_id = ? ORDER BY updated_at DESC',
    scoped.territoryId
  ));
}

function rowsToFindings(rows) {
  return (rows || []).map(rowToFinding);
}

async function transitionFinding(db, change) {
  if (!db || !change || !change.id || !change.toStatus) return { transitioned: false, errors: ['change-required'] };
  await migrateDaemonFindings(db);
  const current = await db.get('SELECT status FROM daemon_findings WHERE id = ?', change.id);
  if (!current) return { transitioned: false, errors: ['not-found'] };
  if (!lifecycle.canTransition(current.status, change.toStatus)) {
    return { transitioned: false, errors: [`forbidden-transition:${current.status}->${change.toStatus}`] };
  }
  await applyTransition(db, change, current.status);
  const updated = await getFinding(db, { id: change.id });
  try {
    await lifecycle.onPostTransition(db, updated.finding, change.toStatus);
  } catch (_) {}
  return updated;
}

async function applyTransition(db, change, fromStatus) {
  if (change.toStatus === 'HYPOTHESIZED' && fromStatus === 'STALE' && change.headSha) {
    await db.run(
      "UPDATE daemon_findings SET status = ?, head_sha = ?, updated_at = datetime('now') WHERE id = ?",
      change.toStatus,
      change.headSha,
      change.id
    );
    return;
  }
  await db.run(
    "UPDATE daemon_findings SET status = ?, updated_at = datetime('now') WHERE id = ?",
    change.toStatus,
    change.id
  );
}

async function markStaleOnHead(db, move) {
  if (!db || !move || !move.territoryId || !move.headSha) return { marked: 0 };
  await migrateDaemonFindings(db);
  const res = await db.run(
    `UPDATE daemon_findings SET status = 'STALE', updated_at = datetime('now')
     WHERE territory_id = ? AND head_sha != ?
       AND status NOT IN ('REFUTED', 'EXPIRED', 'STALE')`,
    move.territoryId,
    move.headSha
  );
  return { marked: (res && res.changes) || 0 };
}

module.exports = {
  validateFindingInput,
  createFinding,
  getFinding,
  listFindings,
  transitionFinding,
  markStaleOnHead
};
