const { getDatabase } = require('../src/db');
const {
  ensureColumn,
  migrateTableBioPolymers,
  tableExists,
  migrateAllBioPolymers
} = require('../src/services/bioPolymerPersistenceService');

async function migrateToMsgPack(database = null) {
  console.log('[Migration] Starting JSON to MsgPack / Bio-Polymer migration...');
  const db = database || await getDatabase();
  await db.exec('BEGIN IMMEDIATE;');
  try {
    let migratedTrajs = 0;
    let migratedDecs = 0;

    if (await tableExists(db, 'trajectories')) {
      migratedTrajs = await migrateTableBioPolymers(db, {
        table: 'trajectories', jsonCol: 'diff_lines', blobCol: 'diff_lines_msgpack'
      });
    }

    if (await tableExists(db, 'genome_decisions')) {
      migratedDecs = await migrateTableBioPolymers(db, {
        table: 'genome_decisions', jsonCol: 'cart_nodes_json', blobCol: 'cart_nodes_msgpack'
      });
    }

    const extraTables = [
      { table: 'cryptobiosis_snapshots', jsonCol: 'state_json', blobCol: 'state_blob' },
      { table: 'cryptobiosis_snapshots', jsonCol: 'metadata_json', blobCol: 'metadata_blob' },
      { table: 'agent_state_snapshots', jsonCol: 'state_json', blobCol: 'state_blob' },
      { table: 'agent_state_snapshots', jsonCol: 'metadata_json', blobCol: 'metadata_blob' },
      { table: 'audit_logs', jsonCol: 'payload_json', blobCol: 'payload_blob' },
      { table: 'telemetry_events', jsonCol: 'payload_json', blobCol: 'payload_blob' }
    ];

    let extraCount = 0;
    for (const conf of extraTables) {
      if (await tableExists(db, conf.table)) {
        extraCount += await migrateTableBioPolymers(db, conf);
      }
    }

    await db.exec('COMMIT;');
    console.log(`[Migration] Migrated ${migratedTrajs} trajectories, ${migratedDecs} genome decisions, and ${extraCount} bio-polymers.`);
    return { migratedTrajs, migratedDecs };
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

if (require.main === module) {
  migrateToMsgPack().catch((error) => {
    console.error('[Migration] MsgPack migration failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { ensureColumn, migrateToMsgPack, migrateAllBioPolymers };

