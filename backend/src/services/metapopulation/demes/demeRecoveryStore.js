'use strict';
const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const { migrateMetapopulation } = require('../../../db/migrations/migrateMetapopulation');

async function recordExtinction(db, input) {
  await migrateMetapopulation(db);
  const extinctionId = input.extinctionId || randomUUID();
  await withTransaction(db, async () => {
    const deme = await db.get('SELECT patch_id, status FROM metapopulation_demes WHERE metapopulation_id = ? AND deme_id = ?', input.metapopulationId, input.demeId);
    if (!deme) throw storeError('METAPOPULATION_DEME_UNKNOWN', 'Unknown deme.');
    if (deme.status === 'COLLAPSED') throw storeError('METAPOPULATION_DEME_ALREADY_COLLAPSED', 'Deme is already collapsed.');
    const now = input.occurredAt || new Date().toISOString();
    await db.run(`INSERT INTO metapopulation_extinctions
      (extinction_id, metapopulation_id, deme_id, patch_id, reason, provenance_json, actor, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, extinctionId, input.metapopulationId, input.demeId, deme.patch_id,
    input.reason, JSON.stringify(input.provenance || {}), input.actor || 'metapopulation-runtime', now);
    await db.run('UPDATE metapopulation_demes SET status = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ?', 'COLLAPSED', now, input.metapopulationId, input.demeId);
    await db.run('UPDATE metapopulation_patches SET status = ?, current_deme_id = NULL, updated_at = ? WHERE metapopulation_id = ? AND patch_id = ?', 'VACANT', now, input.metapopulationId, deme.patch_id);
    await appendEvent(db, input.metapopulationId, { patchId: deme.patch_id, demeId: input.demeId, reason: input.reason, occurredAt: now });
  });
  return { extinctionId, metapopulationId: input.metapopulationId, demeId: input.demeId, status: 'COLLAPSED' };
}

async function listExtinctions(db, metapopulationId, demeId) {
  await migrateMetapopulation(db);
  const rows = await db.all('SELECT * FROM metapopulation_extinctions WHERE metapopulation_id = ? AND deme_id = ? ORDER BY occurred_at, extinction_id', metapopulationId, demeId);
  return rows.map((row) => ({ extinctionId: row.extinction_id, reason: row.reason, patchId: row.patch_id,
    provenance: parseJson(row.provenance_json), actor: row.actor, occurredAt: row.occurred_at }));
}

async function appendEvent(db, metapopulationId, event) {
  const current = await db.get('SELECT revision FROM metapopulation_sessions WHERE id = ?', metapopulationId);
  const sequence = await db.get('SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM metapopulation_events WHERE metapopulation_id = ?', metapopulationId);
  const revision = Number(current.revision) + 1;
  const updated = await db.run('UPDATE metapopulation_sessions SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?', revision, event.occurredAt, metapopulationId, current.revision);
  if (updated.changes !== 1) throw storeError('METAPOPULATION_SESSION_CONFLICT', 'Metapopulation session revision changed.');
  await db.run(`INSERT INTO metapopulation_events
    (metapopulation_id, sequence, revision, event_type, payload_json, provenance_json, actor, occurred_at)
    VALUES (?, ?, ?, 'LOCAL_EXTINCTION', ?, ?, ?, ?)`, metapopulationId, sequence.value, revision,
  JSON.stringify({ demeId: event.demeId, patchId: event.patchId, reason: event.reason }), JSON.stringify({ source: 'demeRecoveryStore' }), 'metapopulation-runtime', event.occurredAt);
}

function parseJson(value) { try { return JSON.parse(value || '{}'); } catch (_) { return {}; } }
function storeError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { recordExtinction, listExtinctions };
