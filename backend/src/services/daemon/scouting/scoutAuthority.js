'use strict';

const crypto = require('node:crypto');
const { migrateDaemonTerritory } = require('../../../db/migrations/migrateDaemonTerritory');
const { ensureStore } = require('../verification/observationReceiptService');

async function ownsTerritory(db, input) {
  await migrateDaemonTerritory(db);
  const owner = await db.get('SELECT daemon_id, health FROM daemon_runtime_state WHERE territory_id = ?', input.territoryId);
  return owner?.daemon_id === input.daemonId && !['APOPTOTIC', 'SENESCENT'].includes(owner.health);
}

async function assertProvenance(db, input) {
  await ensureStore(db);
  for (const id of new Set(input.result.provenanceRecordIds)) {
    const row = await db.get('SELECT payload_hash, payload_json FROM provenance_records WHERE id = ?', id);
    if (!row || crypto.createHash('sha256').update(row.payload_json).digest('hex') !== row.payload_hash) throw new Error('analysis-provenance-not-persisted');
    const payload = JSON.parse(row.payload_json);
    if (payload.territoryId !== input.territory.id || payload.headSha !== input.territory.headSha) throw new Error('analysis-provenance-scope-mismatch');
  }
}

module.exports = { ownsTerritory, assertProvenance };
