'use strict';
const { withTransaction } = require('../../../db');
const { migrateMetapopulation } = require('../../../db/migrations/migrateMetapopulation');
const { normalizeCorridor } = require('../contracts/corridorContract');

async function replaceGraph(db, metapopulationId, input) {
  await migrateMetapopulation(db);
  const corridors = input.corridors.map(normalizeCorridor);
  rejectDuplicatePairs(corridors);
  await withTransaction(db, async () => {
    const session = await db.get('SELECT revision FROM metapopulation_sessions WHERE id = ?', metapopulationId);
    if (!session) throw storeError('METAPOPULATION_SESSION_UNKNOWN', 'Unknown metapopulation session.');
    const demes = await db.all('SELECT deme_id FROM metapopulation_demes WHERE metapopulation_id = ?', metapopulationId);
    const known = new Set(demes.map((deme) => deme.deme_id));
    if (corridors.some((corridor) => !known.has(corridor.sourceDemeId) || !known.has(corridor.targetDemeId))) {
      throw storeError('METAPOPULATION_CORRIDOR_DEME_UNKNOWN', 'A corridor endpoint is not a deme in this session.');
    }
    await db.run('UPDATE metapopulation_corridors SET enabled = 0, updated_at = ? WHERE metapopulation_id = ?', new Date().toISOString(), metapopulationId);
    for (const corridor of corridors) await upsertCorridor(db, metapopulationId, corridor);
    await appendGraphEvent(db, metapopulationId, { revision: session.revision, topology: input.topology, corridorCount: corridors.length });
  });
  return listGraph(db, metapopulationId);
}

async function upsertCorridor(db, metapopulationId, corridor) {
  const now = new Date().toISOString();
  await db.run(`INSERT INTO metapopulation_corridors
    (corridor_id, metapopulation_id, source_deme_id, target_deme_id, status, strength, protocol_json, occurred_at,
     enabled, capacity, migration_cost,
     compatibility, accepted_migrations, rejected_migrations, benefit_history_json, homogenization_risk, weight, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metapopulation_id, source_deme_id, target_deme_id) DO UPDATE SET
     enabled = excluded.enabled, capacity = excluded.capacity, migration_cost = excluded.migration_cost,
     compatibility = excluded.compatibility, homogenization_risk = excluded.homogenization_risk,
     weight = excluded.weight, updated_at = excluded.updated_at`,
  corridor.corridorId, metapopulationId, corridor.sourceDemeId, corridor.targetDemeId, corridor.weight, now, Number(corridor.enabled),
  corridor.capacity, corridor.migrationCost, corridor.compatibility, corridor.acceptedMigrations,
  corridor.rejectedMigrations, JSON.stringify(corridor.benefitHistory), corridor.homogenizationRisk, corridor.weight, now, now);
}

async function appendGraphEvent(db, metapopulationId, event) {
  const nextRevision = Number(event.revision) + 1;
  const row = await db.get('SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM metapopulation_events WHERE metapopulation_id = ?', metapopulationId);
  const now = new Date().toISOString();
  const update = await db.run('UPDATE metapopulation_sessions SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?', nextRevision, now, metapopulationId, event.revision);
  if (update.changes !== 1) throw storeError('METAPOPULATION_SESSION_CONFLICT', 'Metapopulation session revision changed.');
  await db.run(`INSERT INTO metapopulation_events
    (metapopulation_id, sequence, revision, event_type, payload_json, provenance_json, actor, occurred_at)
    VALUES (?, ?, ?, 'CORRIDOR_CHANGED', ?, ?, ?, ?)`, metapopulationId, row.sequence, nextRevision,
  JSON.stringify({ topology: event.topology, corridorCount: event.corridorCount }), JSON.stringify({ source: 'corridorTopologyService' }), 'metapopulation-runtime', now);
}

async function listGraph(db, metapopulationId) {
  await migrateMetapopulation(db);
  const rows = await db.all('SELECT * FROM metapopulation_corridors WHERE metapopulation_id = ? ORDER BY source_deme_id, target_deme_id', metapopulationId);
  return rows.map((row) => ({
    corridorId: row.corridor_id, sourceDemeId: row.source_deme_id, targetDemeId: row.target_deme_id,
    direction: 'directed', enabled: Boolean(row.enabled), capacity: row.capacity, migrationCost: row.migration_cost,
    compatibility: row.compatibility, acceptedMigrations: row.accepted_migrations,
    rejectedMigrations: row.rejected_migrations, benefitHistory: parseJson(row.benefit_history_json),
    homogenizationRisk: row.homogenization_risk, weight: row.weight, createdAt: row.created_at, updatedAt: row.updated_at
  }));
}

function rejectDuplicatePairs(corridors) {
  const keys = corridors.map((item) => `${item.sourceDemeId}->${item.targetDemeId}`);
  if (new Set(keys).size !== keys.length) throw storeError('METAPOPULATION_CORRIDOR_DUPLICATE', 'The graph contains duplicate directed corridors.');
}

function parseJson(value) {
  try { return JSON.parse(value || '[]'); } catch (_) { return []; }
}

function storeError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { replaceGraph, listGraph };
