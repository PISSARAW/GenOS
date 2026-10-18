'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../../db');

const DEFAULT_HANDOFF_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LEASE_TTL_MS = 60 * 1000;
const FINAL_OPERATION_STATES = ['completed', 'failed', 'compensated', 'escalated'];
const ensuredDatabases = new WeakSet();

function isoAt(nowMs, offsetMs = 0) {
  return new Date((nowMs ?? Date.now()) + offsetMs).toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function json(value) {
  return JSON.stringify(value);
}

async function ensureTables(db) {
  if (ensuredDatabases.has(db)) return;
  await require('../../db/migrations/migrateOntogenesisHosts').migrateOntogenesisHosts(db);
  await require('../../db/migrations/migrateOntogenesisContinuity').migrateOntogenesisContinuity(db);
  ensuredDatabases.add(db);
}

async function pairedHost(db, input) {
  const row = await db.get(
    `SELECT * FROM ontogenesis_hosts
     WHERE id = ? AND project_id = ? AND status = 'paired'`,
    [input.hostId, input.projectId]
  );
  if (!row) throw new Error('hote-non-appaire');
  return row;
}

function capabilitiesOf(host) {
  try { return JSON.parse(host.capabilities_json || '{}'); } catch (_) { return {}; }
}

function assertTarget(host, input) {
  if (host.role !== 'controller') throw new Error('hote-cible-non-controleur');
  const capabilities = capabilitiesOf(host);
  if (!capabilities.durableStoreId) throw new Error('stockage-durable-non-atteste');
  if (input.storeId && capabilities.durableStoreId !== input.storeId) {
    throw new Error('stockage-durable-incompatible');
  }
  return capabilities;
}

async function assertQuiescent(db, projectId) {
  const claim = await db.get(
    `SELECT project_id FROM ontogenesis_claims
     WHERE project_id = ? AND julianday(expires_at) > julianday('now')`, [projectId]
  );
  if (claim) throw new Error('bascule-claim-actif');
  const execution = await db.get(
    `SELECT id FROM ontogenesis_execution
     WHERE project_id = ? AND phase IN ('prepared','running','finished','verified')`, [projectId]
  );
  if (execution) throw new Error('bascule-execution-active');
  const placeholders = FINAL_OPERATION_STATES.map(() => '?').join(',');
  const operation = await db.get(
    `SELECT id FROM ontogenesis_operations WHERE project_id = ? AND state NOT IN (${placeholders})`,
    [projectId, ...FINAL_OPERATION_STATES]
  );
  if (operation) throw new Error('bascule-operation-incomplete');
}

async function projectManifest(db, context) {
  const { input, target, capabilities } = context;
  const project = await db.get(
    `SELECT id, root_path, branch, objective, config_version, state
     FROM ontogenesis_projects WHERE id = ?`, [input.projectId]
  );
  if (!project) throw new Error('projet-introuvable');
  const backlog = await db.get(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS remaining
     FROM ontogenesis_backlog WHERE project_id = ?`, [input.projectId]
  );
  return {
    version: 1, project, backlog,
    target: { id: target.id, endpoint: target.endpoint },
    durableStoreId: capabilities.durableStoreId,
    preparedAt: isoAt(input.nowMs)
  };
}

async function currentGeneration(db, projectId) {
  const row = await db.get(
    'SELECT generation, state FROM ontogenesis_continuity WHERE project_id = ?', [projectId]
  );
  if (row && row.state !== 'local') throw new Error(`continuite-deja-engagee:${row.state}`);
  return Number(row?.generation || 0);
}

async function recordReceipt(db, input) {
  await db.run(
    `INSERT INTO ontogenesis_continuity_receipts
       (id, project_id, handoff_id, kind, generation, host_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`continuity_receipt_${crypto.randomUUID()}`, input.projectId, input.handoffId || null,
      input.kind, input.generation, input.hostId || null, json(input.details || {})]
  );
}

async function persistPrepared(db, input) {
  const target = await pairedHost(db, { projectId: input.projectId, hostId: input.targetHostId });
  const capabilities = assertTarget(target, input);
  if (input.sourceHostId) await pairedHost(db, { projectId: input.projectId, hostId: input.sourceHostId });
  await assertQuiescent(db, input.projectId);
  const generation = (await currentGeneration(db, input.projectId)) + 1;
  const manifest = await projectManifest(db, { input, target, capabilities });
  const manifestJson = json(manifest);
  const token = crypto.randomBytes(32).toString('hex');
  const handoffId = `handoff_${crypto.randomUUID()}`;
  const expiresAt = isoAt(input.nowMs, input.ttlMs || DEFAULT_HANDOFF_TTL_MS);
  await db.run(
    `INSERT INTO ontogenesis_handoffs
       (id, project_id, source_host_id, target_host_id, generation, token_hash,
        manifest_json, manifest_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [handoffId, input.projectId, input.sourceHostId || null, target.id, generation,
      digest(token), manifestJson, digest(manifestJson), expiresAt]
  );
  await db.run(
    `INSERT INTO ontogenesis_continuity
       (project_id, state, generation, active_host_id, handoff_id, lease_expires_at)
     VALUES (?, 'handoff_pending', ?, NULL, ?, NULL)
     ON CONFLICT(project_id) DO UPDATE SET state = 'handoff_pending', generation = excluded.generation,
       active_host_id = NULL, handoff_id = excluded.handoff_id, lease_expires_at = NULL,
       updated_at = datetime('now')`, [input.projectId, generation, handoffId]
  );
  await recordReceipt(db, { ...input, handoffId, generation, kind: 'handoff_prepared',
    details: { targetHostId: target.id, manifestHash: digest(manifestJson), expiresAt } });
  return { handoffId, generation, token, expiresAt, manifestHash: digest(manifestJson) };
}

async function prepareHandoff(db, input) {
  await ensureTables(db);
  return withTransaction(db, () => persistPrepared(db, input));
}

function verifyPrepared(row, input) {
  if (!row || row.state !== 'prepared') throw new Error('bascule-non-disponible');
  if (row.target_host_id !== input.hostId) throw new Error('hote-cible-invalide');
  if (row.expires_at <= isoAt(input.nowMs)) throw new Error('bascule-expiree');
  if (!input.token || digest(input.token) !== row.token_hash) throw new Error('jeton-bascule-invalide');
}

async function persistAccepted(db, input) {
  const host = await pairedHost(db, input);
  if (host.role !== 'controller') throw new Error('hote-cible-non-controleur');
  const row = await db.get(
    'SELECT * FROM ontogenesis_handoffs WHERE id = ? AND project_id = ?',
    [input.handoffId, input.projectId]
  );
  verifyPrepared(row, input);
  const now = isoAt(input.nowMs);
  const leaseExpiresAt = isoAt(input.nowMs, input.leaseTtlMs || DEFAULT_LEASE_TTL_MS);
  const handoffUpdate = await db.run(
    `UPDATE ontogenesis_handoffs SET state = 'active', token_hash = ?, accepted_at = ?,
       updated_at = datetime('now') WHERE id = ? AND state = 'prepared'`,
    [digest(`consumed:${row.token_hash}`), now, row.id]
  );
  if (!handoffUpdate.changes) throw new Error('bascule-concurrente');
  const continuityUpdate = await db.run(
    `UPDATE ontogenesis_continuity SET state = 'remote_active', active_host_id = ?,
       lease_expires_at = ?, updated_at = datetime('now')
     WHERE project_id = ? AND handoff_id = ? AND state = 'handoff_pending'`,
    [host.id, leaseExpiresAt, input.projectId, row.id]
  );
  if (!continuityUpdate.changes) throw new Error('etat-continuite-incoherent');
  await recordReceipt(db, { ...input, generation: row.generation, kind: 'handoff_accepted',
    details: { leaseExpiresAt, manifestHash: row.manifest_hash } });
  return { handoffId: row.id, generation: row.generation, hostId: host.id, leaseExpiresAt };
}

async function acceptHandoff(db, input) {
  await ensureTables(db);
  return withTransaction(db, () => persistAccepted(db, input));
}

function exactController(row, input) {
  return row.active_host_id === input.hostId && Number(row.generation) === Number(input.generation);
}

async function expireLease(db, row, input) {
  await db.run(
    `UPDATE ontogenesis_continuity SET state = 'reclaim_required', updated_at = datetime('now')
     WHERE project_id = ? AND state = 'remote_active' AND generation = ?`,
    [input.projectId, row.generation]
  );
  await db.run(
    `UPDATE ontogenesis_handoffs SET state = 'expired', updated_at = datetime('now')
     WHERE id = ? AND state = 'active'`, [row.handoff_id]
  );
  await recordReceipt(db, { projectId: input.projectId, handoffId: row.handoff_id,
    generation: row.generation, hostId: row.active_host_id, kind: 'lease_expired' });
}

async function authorizeTick(db, input) {
  await ensureTables(db);
  return withTransaction(db, async () => {
    const row = await db.get('SELECT * FROM ontogenesis_continuity WHERE project_id = ?', [input.projectId]);
    if (!row) return input.hostId ? { allowed: false, reason: 'continuite-non-active' } : { allowed: true };
    if (row.state === 'handoff_pending') return { allowed: false, reason: 'bascule-en-attente' };
    if (row.state === 'reclaim_required') return { allowed: false, reason: 'reprise-explicite-requise' };
    if (!exactController(row, input)) return { allowed: false, reason: 'controleur-continuite-invalide' };
    if (row.state === 'remote_active' && row.lease_expires_at <= isoAt(input.nowMs)) {
      await expireLease(db, row, input);
      return { allowed: false, reason: 'lease-continuite-expire' };
    }
    if (row.state === 'remote_active') {
      const expiresAt = isoAt(input.nowMs, input.leaseTtlMs || DEFAULT_LEASE_TTL_MS);
      await db.run(`UPDATE ontogenesis_continuity SET lease_expires_at = ?, updated_at = datetime('now')
        WHERE project_id = ? AND generation = ?`, [expiresAt, input.projectId, row.generation]);
      await db.run(`UPDATE ontogenesis_hosts SET last_seen = ? WHERE id = ?`, [isoAt(input.nowMs), row.active_host_id]);
    }
    return { allowed: true, generation: row.generation, hostId: row.active_host_id };
  });
}

async function persistReclaimed(db, input) {
  const host = await pairedHost(db, input);
  if (host.role !== 'local') throw new Error('hote-reprise-non-local');
  const row = await db.get('SELECT * FROM ontogenesis_continuity WHERE project_id = ?', [input.projectId]);
  if (!row || row.state === 'handoff_pending') throw new Error('reprise-interdite-bascule-en-attente');
  if (row.state === 'local') throw new Error('continuite-deja-locale');
  const now = isoAt(input.nowMs);
  if (row.state === 'remote_active' && row.lease_expires_at > now) throw new Error('reprise-interdite-lease-active');
  if (row.state === 'remote_active') await expireLease(db, row, input);
  const generation = Number(row.generation) + 1;
  await db.run(
    `UPDATE ontogenesis_continuity SET state = 'local', generation = ?, active_host_id = ?,
       handoff_id = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE project_id = ?`,
    [generation, host.id, input.projectId]
  );
  if (row.handoff_id) await db.run(
    `UPDATE ontogenesis_handoffs SET state = 'reclaimed', updated_at = datetime('now')
     WHERE id = ? AND state IN ('active','expired')`, [row.handoff_id]
  );
  await recordReceipt(db, { ...input, handoffId: row.handoff_id, generation,
    kind: 'local_reclaimed', details: { previousGeneration: row.generation } });
  return { state: 'local', hostId: host.id, generation };
}

async function reclaimLocal(db, input) {
  await ensureTables(db);
  return withTransaction(db, () => persistReclaimed(db, input));
}

async function getContinuity(db, projectId) {
  await ensureTables(db);
  const state = await db.get('SELECT * FROM ontogenesis_continuity WHERE project_id = ?', [projectId]);
  const handoff = state?.handoff_id
    ? await db.get('SELECT id, target_host_id, generation, state, manifest_hash, expires_at, accepted_at FROM ontogenesis_handoffs WHERE id = ?', [state.handoff_id])
    : null;
  return { state: state || { project_id: projectId, state: 'local', generation: 0 }, handoff };
}

module.exports = { prepareHandoff, acceptHandoff, authorizeTick, reclaimLocal, getContinuity };
