'use strict';

const crypto = require('crypto');

/**
 * Identités d'hôtes pour le protocole de continuité (roadmap §P8).
 * Le pairing seul ne déplace ni la base ni le dépôt : la bascule exige
 * un stockage durable transféré exclusivement. Une seule machine locale : appairer
 * une seconde retire la première. Codes à usage unique, expirés
 * par défaut après 15 minutes.
 */

const ROLES = ['controller', 'worker', 'local'];
const DEFAULT_CODE_TTL_MS = 900000;

function newCode() {
  return crypto.randomBytes(4).toString('hex');
}

function expiryIso(ttlMs) {
  return new Date(Date.now() + ttlMs).toISOString();
}

async function createPairing(db, input) {
  if (!ROLES.includes(input.role)) throw new Error('role-hote-inconnu');
  const code = newCode();
  const expires = expiryIso(input.ttlMs || DEFAULT_CODE_TTL_MS);
  const id = input.id || `host_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO ontogenesis_hosts (id, project_id, role, endpoint, status, pairing_code, code_expires_at, capabilities_json)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
     ON CONFLICT(project_id, role, endpoint)
     DO UPDATE SET status = 'pending', pairing_code = ?, code_expires_at = ?, capabilities_json = ?`,
    [id, input.projectId, input.role, input.endpoint || '', code, expires,
      JSON.stringify(input.capabilities || {}), code, expires, JSON.stringify(input.capabilities || {})]
  );
  const stored = await db.get(
    'SELECT id FROM ontogenesis_hosts WHERE project_id = ? AND role = ? AND endpoint = ?',
    [input.projectId, input.role, input.endpoint || '']
  );
  return { hostId: stored.id, code, expiresAt: expires };
}

function isExpired(row, nowIso) {
  return !row.code_expires_at || row.code_expires_at <= nowIso;
}

async function retireOtherLocals(db, projectId, keepId) {
  await db.run(
    `UPDATE ontogenesis_hosts SET status = 'retired', pairing_code = NULL
     WHERE project_id = ? AND role = 'local' AND status = 'paired' AND id != ?`,
    [projectId, keepId]
  );
}

async function claimPairing(db, input) {
  const now = input.nowIso || new Date().toISOString();
  const row = await db.get(
    `SELECT * FROM ontogenesis_hosts WHERE project_id = ? AND pairing_code = ? AND status = 'pending'`,
    [input.projectId, input.code]
  );
  if (!row) throw new Error('code-inconnu');
  if (isExpired(row, now)) throw new Error('code-expire');
  if (row.role === 'local') await retireOtherLocals(db, row.project_id, row.id);
  await db.run(
    `UPDATE ontogenesis_hosts SET status = 'paired', pairing_code = NULL, code_expires_at = NULL,
       last_seen = datetime('now') WHERE id = ?`,
    [row.id]
  );
  return { hostId: row.id, role: row.role, endpoint: row.endpoint };
}

async function heartbeat(db, input) {
  const row = await db.get(
    `SELECT * FROM ontogenesis_hosts WHERE project_id = ? AND endpoint = ? AND status = 'paired'`,
    [input.projectId, input.endpoint]
  );
  if (!row) return null;
  await db.run(`UPDATE ontogenesis_hosts SET last_seen = datetime('now') WHERE id = ?`, [row.id]);
  return { hostId: row.id, role: row.role };
}

async function listHosts(db, projectId) {
  return db.all('SELECT * FROM ontogenesis_hosts WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
}

module.exports = { ROLES, createPairing, claimPairing, heartbeat, listHosts };
