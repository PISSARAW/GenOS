const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const {
  packBioPolymer,
  unpackBioPolymer,
  measurePolymerCompression,
  migrateAllBioPolymers
} = require('../src/services/bioPolymerPersistenceService');

async function run() {
  console.log('--- Test 1: Bio-Polymer Polymorphic Pack / Unpack ---');
  const sampleData = {
    agentId: 'griot-01',
    capabilities: ['diff', 'stigmergy', 'cryptobiosis'],
    atpLevel: 84.5,
    active: true
  };

  const packed = packBioPolymer(sampleData);
  assert.ok(Buffer.isBuffer(packed) || packed instanceof Uint8Array);
  
  // Unpack from binary buffer
  const unpackedFromBuffer = unpackBioPolymer(packed);
  assert.deepStrictEqual(unpackedFromBuffer, sampleData);

  // Unpack from legacy JSON string
  const jsonStr = JSON.stringify(sampleData);
  const unpackedFromJson = unpackBioPolymer(jsonStr);
  assert.deepStrictEqual(unpackedFromJson, sampleData);

  // Compression metrics
  const metrics = measurePolymerCompression(sampleData);
  assert.ok(metrics.blobBytes < metrics.jsonBytes, `Blob (${metrics.blobBytes}B) must be smaller than JSON (${metrics.jsonBytes}B)`);
  assert.ok(metrics.savedPercent > 10.0, `Compression savings must be significant: ${metrics.savedPercent}%`);
  console.log(`✓ Biological compaction: ${metrics.jsonBytes} bytes ASCII -> ${metrics.blobBytes} bytes bio-polymer (${metrics.savedPercent}% saved, ratio ${metrics.ratio}x)`);

  console.log('--- Test 2: SQLite Schema Migration to Bio-Polymer BLOBs ---');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  
  // Create tables with legacy JSON text columns
  await db.exec(`
    CREATE TABLE cryptobiosis_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      state_json TEXT,
      metadata_json TEXT
    );
    CREATE TABLE agent_state_snapshots (
      id TEXT PRIMARY KEY,
      state_json TEXT,
      metadata_json TEXT
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_json TEXT
    );
    CREATE TABLE telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_json TEXT
    );
  `);

  // Insert test rows with legacy JSON text
  const cryptoState = JSON.stringify({ genome: 'AGCTTCGA', osmolyte: 'trehalose', vitrified: true });
  const cryptoMeta = JSON.stringify({ reason: 'drought_stress', phase: 'osmobiosis' });
  await db.run('INSERT INTO cryptobiosis_snapshots (snapshot_id, state_json, metadata_json) VALUES (?, ?, ?)',
    ['snap-bio-1', cryptoState, cryptoMeta]);

  await db.run('INSERT INTO agent_state_snapshots (id, state_json, metadata_json) VALUES (?, ?, ?)',
    ['state-1', JSON.stringify({ status: 'quiescent' }), JSON.stringify({ cycle: 42 })]);

  await db.run('INSERT INTO audit_logs (payload_json) VALUES (?)',
    [JSON.stringify({ action: 'STIGMERGY_CONVERGENCE', score: 0.98 })]);

  await db.run('INSERT INTO telemetry_events (payload_json) VALUES (?)',
    [JSON.stringify({ event: 'IONIC_PUMP_ACTIVATED', flux_mV: -65.2 })]);

  // Execute migration
  const stats = await migrateAllBioPolymers(db);
  assert.strictEqual(stats['cryptobiosis_snapshots.state_blob'], 1);
  assert.strictEqual(stats['cryptobiosis_snapshots.metadata_blob'], 1);
  assert.strictEqual(stats['agent_state_snapshots.state_blob'], 1);
  assert.strictEqual(stats['agent_state_snapshots.metadata_blob'], 1);
  assert.strictEqual(stats['audit_logs.payload_blob'], 1);
  assert.strictEqual(stats['telemetry_events.payload_blob'], 1);

  // Verify binary unpack integrity
  const cryptoRow = await db.get('SELECT state_blob, metadata_blob FROM cryptobiosis_snapshots WHERE snapshot_id = ?', ['snap-bio-1']);
  assert.ok(cryptoRow.state_blob, 'state_blob must be populated');
  assert.ok(cryptoRow.metadata_blob, 'metadata_blob must be populated');
  assert.deepStrictEqual(unpackBioPolymer(cryptoRow.state_blob), JSON.parse(cryptoState));
  assert.deepStrictEqual(unpackBioPolymer(cryptoRow.metadata_blob), JSON.parse(cryptoMeta));

  const auditRow = await db.get('SELECT payload_blob FROM audit_logs WHERE id = 1');
  assert.deepStrictEqual(unpackBioPolymer(auditRow.payload_blob), { action: 'STIGMERGY_CONVERGENCE', score: 0.98 });

  console.log('✓ All 4 tables successfully migrated to biological binary BLOBs');

  console.log('--- Test 3: Idempotence Verification ---');
  const secondRunStats = await migrateAllBioPolymers(db);
  assert.strictEqual(secondRunStats['cryptobiosis_snapshots.state_blob'], 0);
  assert.strictEqual(secondRunStats['agent_state_snapshots.state_blob'], 0);
  assert.strictEqual(secondRunStats['audit_logs.payload_blob'], 0);
  assert.strictEqual(secondRunStats['telemetry_events.payload_blob'], 0);
  console.log('✓ Migration is strictly idempotent (0 re-migrated rows on second pass)');

  await db.close();
  console.log('ALL BIO-POLYMER PERSISTENCE & MIGRATION TESTS PASSED!');
}

run().catch((error) => {
  console.error('Test failure:', error);
  process.exitCode = 1;
});
