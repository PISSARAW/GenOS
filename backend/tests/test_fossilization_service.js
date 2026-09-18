/**
 * Fossilisation stratigraphique : taphonomie, intégrité minérale, strates et
 * excavation en lecture seule (cf. docs/01-concepts/fossilisation.md, ADR 0003).
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'fossilization-suite-only';
process.env.GENOS_FOSSIL_ARTIFACT = '0';
const { getDatabase, closeDatabase } = require('../src/db');
const fossilization = require('../src/services/fossilizationService');

function testPureCanonicalRecord() {
  const record = fossilization.buildFossilRecord({
    lineageId: 'lineage_test',
    reason: 'budget exhausted',
    mode: 'external_mold',
    hardParts: ['genome', 'provenance'],
    softPartsLost: ['ephemeral_context'],
    phenotypeMarkers: [
      { marker: 'outcome', value: 'validated', shape: 'elongated' },
      { marker: 'risk', value: 'contained', shape: 'elongated' }
    ]
  });
  assert.equal(record.mode, 'external_mold');
  assert.equal(record.stratum_id, `stratum-${record.recorded_at.split('T')[0]}`);
  assert.equal(record.payload_hash.length, 64);
  assert(Math.abs(record.conservation_quality - 2 / 3) < 1e-9);
  assert(fossilization.verifyFossilIntegrity(record), 'Fresh fossil must verify');

  const tampered = { ...record, reason: 'rewritten history' };
  assert(!fossilization.verifyFossilIntegrity(tampered), 'Tampering must be detected');

  assert.equal(fossilization.decodePhenotype(record.phenotype_markers).inferred_class, 'safe_success');
  assert.equal(fossilization.normalizeMode('moule_externe'), 'external_mold');
  assert.equal(fossilization.normalizeMode('unknown'), 'petrification');
}

async function testPersistenceAndExcavation(db) {
  const first = await fossilization.recordFossil(
    { lineageId: 'lineage_db', reason: 'apoptosis', mode: 'petrification' },
    db
  );
  assert(first.success && first.indexed, 'Fossil must be indexed');
  assert(first.fossil.payload_hash, 'Fossil must carry a mineral hash');

  const list = await fossilization.listFossils(db);
  assert(list.some((f) => f.fossil_id === first.fossil.fossil_id), 'Fossil must be listed');

  const strata = await fossilization.listStrata(db);
  assert(strata.length >= 1, 'At least one stratum expected');
  assert(strata[0].indexed_count >= 1, 'Stratum must index its fossils');

  const excavated = await fossilization.excavateFossil(db, first.fossil.fossil_id);
  assert(excavated.success, 'Excavation must succeed');
  assert(excavated.read_only && excavated.resurrection === 'forbidden', 'Excavation is read-only');
  assert(excavated.integrity_verified, 'Excavated fossil must verify');

  await assert.rejects(
    () => fossilization.recordFossil({ fossilId: first.fossil.fossil_id, lineageId: 'rewritten', reason: 'tampered' }, db),
    /constraint|unique/i,
    'Existing fossils must be immutable'
  );

  const missing = await fossilization.excavateFossil(db, 'does-not-exist');
  assert(!missing.success, 'Missing fossil must not be excavatable');
}

async function run() {
  console.log('=== Test Suite: Fossilisation stratigraphique ===\n');
  testPureCanonicalRecord();
  console.log('   ✓ Canonical mineral record, integrity and phenotype decoding');

  const dbPath = path.join(os.tmpdir(), `genos_fossil_test_${Date.now()}.db`);
  const db = await getDatabase(dbPath);
  try {
    await testPersistenceAndExcavation(db);
    console.log('   ✓ Persistence, strata indexing and read-only excavation');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  }
  console.log('\nAll fossilization tests passed.');
}

run().catch((error) => {
  console.error('Fossilization test failure:', error);
  process.exit(1);
});
