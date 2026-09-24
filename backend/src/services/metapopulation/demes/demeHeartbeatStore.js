'use strict';
const { migrateMetapopulationRuntime } = require('../../../db/migrations/migrateMetapopulationRuntime');
const { validateDemeHeartbeat } = require('../contracts/demeHeartbeatContract');
const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');

async function recordHeartbeat(db, metapopulationId, input) {
  const valid = validateDemeHeartbeat(input);
  await migrateMetapopulationRuntime(db);
  const now = input.occurredAt || new Date().toISOString();
  const heartbeatId = input.heartbeatId || randomUUID();
  await withTransaction(db, async () => {
    const deme = await db.get('SELECT deme_id FROM metapopulation_demes WHERE metapopulation_id = ? AND deme_id = ?', metapopulationId, valid.demeId);
    if (!deme) throw Object.assign(new Error('Unknown deme.'), { code: 'METAPOPULATION_DEME_UNKNOWN' });
    await db.run(
      `INSERT INTO metapopulation_deme_heartbeats
       (heartbeat_id, metapopulation_id, deme_id, local_state_version, health, last_evidence_at,
        migration_ready, recovery_ready, provenance_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      heartbeatId, metapopulationId, valid.demeId, valid.localStateVersion, valid.health,
      valid.lastEvidenceAt || null, Number(valid.migrationReady), Number(valid.recoveryReady),
      JSON.stringify(input.provenance || {}), now
    );
    await db.run(
      'UPDATE metapopulation_demes SET last_heartbeat_at = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ?',
      now, now, metapopulationId, valid.demeId
    );
  });
  return { ...valid, heartbeatId, occurredAt: now };
}

async function latestHeartbeats(db, metapopulationId) {
  await migrateMetapopulationRuntime(db);
  return db.all(
    `SELECT h.* FROM metapopulation_deme_heartbeats h
     WHERE h.metapopulation_id = ? AND h.heartbeat_id = (
       SELECT latest.heartbeat_id FROM metapopulation_deme_heartbeats latest
       WHERE latest.metapopulation_id = h.metapopulation_id AND latest.deme_id = h.deme_id
       ORDER BY latest.occurred_at DESC, latest.heartbeat_id DESC LIMIT 1
     )`,
    metapopulationId
  );
}
module.exports = { recordHeartbeat, latestHeartbeats };
