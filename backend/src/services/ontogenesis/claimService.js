'use strict';

/**
 * Claims transactionnels d'Ontogenèse (ADR 0235).
 * Un seul détenteur par projet ; expiration contre les morts ;
 * operation_id idempotent contre les doubles dispatchs.
 * Conventions : 1er param db, 2e objet claim { projectId, owner, ttlMs }.
 */

function nowIso(offsetMs) {
  return new Date(Date.now() + (offsetMs || 0)).toISOString();
}

function claimTtl(claim) {
  return (claim && claim.ttlMs) || 60000;
}

async function insertClaim(db, claim) {
  const operationId = `${claim.owner}:${Date.now()}`;
  await db.run(
    `INSERT INTO ontogenesis_claims (project_id, owner, operation_id, expires_at)
     VALUES (?, ?, ?, ?)`,
    [claim.projectId, claim.owner, operationId, nowIso(claimTtl(claim))]
  );
  return { acquired: true, operationId };
}

async function acquireClaim(db, claim) {
  try {
    return await insertClaim(db, claim);
  } catch (_) {
    return renewIfExpired(db, claim);
  }
}

async function renewIfExpired(db, claim) {
  const row = await db.get(
    'SELECT * FROM ontogenesis_claims WHERE project_id = ?',
    [claim.projectId]
  );
  if (!row) return { acquired: false, reason: 'claim-concurrent' };
  if (row.owner === claim.owner) return refreshClaim(db, claim);
  if (isExpired(row)) return stealExpired(db, claim);
  return { acquired: false, reason: 'claim-actif' };
}

function isExpired(row) {
  return String(row.expires_at) <= new Date().toISOString();
}

async function refreshClaim(db, claim) {
  const operationId = `renewed:${Date.now()}`;
  await db.run(
    `UPDATE ontogenesis_claims SET operation_id = ?, expires_at = ?, updated_at = datetime('now')
     WHERE project_id = ?`,
    [operationId, nowIso(claimTtl(claim)), claim.projectId]
  );
  return { acquired: true, operationId, renewed: true };
}

async function stealExpired(db, claim) {
  const operationId = `${claim.owner}:${Date.now()}`;
  const info = await db.run(
    `UPDATE ontogenesis_claims SET owner = ?, operation_id = ?, expires_at = ?, updated_at = datetime('now')
     WHERE project_id = ? AND expires_at <= datetime('now')`,
    [claim.owner, operationId, nowIso(claimTtl(claim)), claim.projectId]
  );
  if (wasUpdated(info)) return { acquired: true, operationId, stolen: true };
  return { acquired: false, reason: 'claim-actif' };
}

function wasUpdated(info) {
  return Boolean(info) && (info.changes === undefined || info.changes > 0);
}

async function releaseClaim(db, claim) {
  await db.run(
    'DELETE FROM ontogenesis_claims WHERE project_id = ? AND owner = ?',
    [claim.projectId, claim.owner]
  );
}

module.exports = { acquireClaim, releaseClaim };
