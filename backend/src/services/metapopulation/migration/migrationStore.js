'use strict';
const { withTransaction } = require('../../../db');
const { migrateMetapopulation } = require('../../../db/migrations/migrateMetapopulation');
const { validatePropagule } = require('../contracts/propaguleContract');

async function offerMigration(db, input) {
  await migrateMetapopulation(db);
  const propagule = validatePropagule(input.propagule);
  const { metapopulationId, corridorId } = input;
  const migrationId = await withTransaction(db, async () => {
    const corridor = await db.get('SELECT * FROM metapopulation_corridors WHERE metapopulation_id = ? AND corridor_id = ?', metapopulationId, corridorId);
    if (!corridor || !corridor.enabled || corridor.source_deme_id !== propagule.sourceDemeId || corridor.target_deme_id !== propagule.targetDemeId) {
      throw storeError('METAPOPULATION_CORRIDOR_UNAVAILABLE', 'The propagule does not match an enabled corridor.');
    }
    const pending = await db.get(`SELECT COUNT(*) AS value FROM metapopulation_migrations
      WHERE corridor_id = ? AND status = 'QUARANTINED'`, corridorId);
    if (pending.value >= corridor.capacity) throw storeError('METAPOPULATION_CORRIDOR_CAPACITY_EXHAUSTED', 'The corridor has no remaining capacity.');
    const id = propagule.propaguleId;
    const now = new Date().toISOString();
    await db.run(`INSERT INTO metapopulation_migrations
      (migration_id, metapopulation_id, corridor_id, source_deme_id, target_deme_id, propagule_type, status,
       payload_ref, provenance_json, evidence_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'QUARANTINED', ?, ?, ?, ?)`, id, metapopulationId, corridorId,
    propagule.sourceDemeId, propagule.targetDemeId, propagule.type, propagule.payloadRef,
    JSON.stringify(propagule.provenance), JSON.stringify({ lineageRefs: propagule.lineageRefs, sourceEvidence: propagule.sourceEvidence, sourceFitness: propagule.sourceFitness, novelty: propagule.novelty, migrationReason: propagule.migrationReason }), now);
    await appendEvent(db, metapopulationId, { type: 'MIGRATION_OFFERED', payload: { migrationId: id, corridorId, sourceDemeId: propagule.sourceDemeId, targetDemeId: propagule.targetDemeId, propaguleType: propagule.type } });
    return id;
  });
  const row = await readMigrationRow(db, metapopulationId, migrationId);
  return toMigration(row);
}

async function getMigration(db, metapopulationId, migrationId) {
  await migrateMetapopulation(db);
  const row = await readMigrationRow(db, metapopulationId, migrationId);
  return row ? toMigration(row) : null;
}

async function listQuarantine(db, metapopulationId, targetDemeId) {
  await migrateMetapopulation(db);
  const rows = await db.all(`SELECT * FROM metapopulation_migrations
    WHERE metapopulation_id = ? AND target_deme_id = ? AND status = 'QUARANTINED' ORDER BY created_at, migration_id`, metapopulationId, targetDemeId);
  return rows.map(toMigration);
}

async function countRescueAttempts(db, metapopulationId, targetDemeId) {
  await migrateMetapopulation(db);
  const rows = await db.all('SELECT evidence_json FROM metapopulation_migrations WHERE metapopulation_id = ? AND target_deme_id = ?', metapopulationId, targetDemeId);
  return rows.filter((row) => parseJson(row.evidence_json).migrationReason === 'rescue').length;
}

async function resolveMigration(db, metapopulationId, decision) {
  await migrateMetapopulation(db);
  const { migrationId } = decision;
  await withTransaction(db, async () => {
    const current = await db.get('SELECT * FROM metapopulation_migrations WHERE metapopulation_id = ? AND migration_id = ?', metapopulationId, migrationId);
    if (!current) throw storeError('METAPOPULATION_MIGRATION_UNKNOWN', 'Unknown migration.');
    if (current.status !== 'QUARANTINED') throw storeError('METAPOPULATION_MIGRATION_ALREADY_RESOLVED', 'Migration is no longer in receiver quarantine.');
    const accepted = decision.status === 'ACCEPTED';
    const now = new Date().toISOString();
    const evidence = { ...parseJson(current.evidence_json), receiverValidation: decision.validation, assimilation: decision.receipt || null, rejectionReason: decision.reason || null };
    await db.run('UPDATE metapopulation_migrations SET status = ?, evidence_json = ?, resolved_at = ? WHERE migration_id = ? AND status = ?', decision.status, JSON.stringify(evidence), now, migrationId, 'QUARANTINED');
    const counter = accepted ? 'accepted_migrations' : 'rejected_migrations';
    await db.run(`UPDATE metapopulation_corridors SET ${counter} = ${counter} + 1, updated_at = ? WHERE corridor_id = ?`, now, current.corridor_id);
    await appendEvent(db, metapopulationId, { type: accepted ? 'MIGRATION_ACCEPTED' : 'MIGRATION_REJECTED', payload: { migrationId, targetDemeId: current.target_deme_id, reason: decision.reason || null } });
  });
  const row = await readMigrationRow(db, metapopulationId, migrationId);
  return toMigration(row);
}

async function rollbackAcceptedMigration(db, metapopulationId, input) {
  await migrateMetapopulation(db);
  await withTransaction(db, async () => {
    const row = await db.get('SELECT * FROM metapopulation_migrations WHERE metapopulation_id = ? AND migration_id = ?', metapopulationId, input.migrationId);
    if (!row) throw storeError('METAPOPULATION_MIGRATION_UNKNOWN', 'Unknown migration.');
    if (row.status !== 'ACCEPTED') throw storeError('METAPOPULATION_RESCUE_NOT_REVERSIBLE', 'Only an accepted migration can be rolled back.');
    const evidence = { ...parseJson(row.evidence_json), rescueRollback: input.receipt, rescueReason: input.reason };
    const now = new Date().toISOString();
    await db.run('UPDATE metapopulation_migrations SET status = ?, evidence_json = ?, resolved_at = ? WHERE migration_id = ? AND status = ?', 'ROLLED_BACK', JSON.stringify(evidence), now, input.migrationId, 'ACCEPTED');
    await db.run('UPDATE metapopulation_corridors SET weight = MAX(0, weight - ?), updated_at = ? WHERE corridor_id = ?', input.penalty, now, row.corridor_id);
    await appendEvent(db, metapopulationId, { type: 'MIGRATION_ROLLED_BACK', payload: { migrationId: input.migrationId, corridorId: row.corridor_id, reason: input.reason, penalty: input.penalty } });
  });
  return toMigration(await readMigrationRow(db, metapopulationId, input.migrationId));
}

async function readMigrationRow(db, metapopulationId, migrationId) {
  return db.get('SELECT * FROM metapopulation_migrations WHERE metapopulation_id = ? AND migration_id = ?', metapopulationId, migrationId);
}

async function appendEvent(db, metapopulationId, event) {
  const session = await db.get('SELECT revision FROM metapopulation_sessions WHERE id = ?', metapopulationId);
  const sequence = await db.get('SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM metapopulation_events WHERE metapopulation_id = ?', metapopulationId);
  const now = new Date().toISOString();
  const revision = Number(session.revision) + 1;
  const updated = await db.run('UPDATE metapopulation_sessions SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?', revision, now, metapopulationId, session.revision);
  if (updated.changes !== 1) throw storeError('METAPOPULATION_SESSION_CONFLICT', 'Metapopulation session revision changed.');
  await db.run(`INSERT INTO metapopulation_events
    (metapopulation_id, sequence, revision, event_type, payload_json, provenance_json, actor, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, metapopulationId, sequence.value, revision, event.type, JSON.stringify(event.payload),
  JSON.stringify({ source: 'metapopulationMigrationStore' }), 'metapopulation-runtime', now);
}

function toMigration(row) {
  return { migrationId: row.migration_id, metapopulationId: row.metapopulation_id, corridorId: row.corridor_id,
    sourceDemeId: row.source_deme_id, targetDemeId: row.target_deme_id, type: row.propagule_type,
    status: row.status, payloadRef: row.payload_ref, provenance: parseJson(row.provenance_json),
    evidence: parseJson(row.evidence_json), createdAt: row.created_at, resolvedAt: row.resolved_at };
}

function parseJson(value) { try { return JSON.parse(value || '{}'); } catch (_) { return {}; } }
function storeError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { offerMigration, getMigration, listQuarantine, countRescueAttempts, resolveMigration, rollbackAcceptedMigration };
