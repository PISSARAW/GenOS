/**
 * L'orchestrateur peut-il fossiliser, lister les strates, excaver et décoder
 * à sa discrétion ? Vérifie le dispatch réel des primitives de stratégie
 * (cf. docs/FOSSILISATION.md, ADR 0003).
 */
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'orchestrator-fossilization-test';
process.env.GENOS_FOSSIL_ARTIFACT = '0';

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { getDatabase, closeDatabase } = require('../src/db');
const adapter = require('../src/services/strategyExecutionAdapter');

async function testDispatch() {
  const lineageId = 'orch_lineage_' + Date.now();
  const fossilize = await adapter.executePrimitive('fossilize', {
    lineageId,
    reason: 'Orchestrator autonomous pruning',
    mode: 'external_mold',
    hardParts: ['genome', 'evidence'],
    softPartsLost: ['volatile_context'],
    phenotypeMarkers: [{ marker: 'outcome', value: 'validated', shape: 'elongated' }]
  });
  assert(fossilize.success, 'orchestrator fossilize failed: ' + JSON.stringify(fossilize));
  assert(fossilize.fossil && fossilize.fossil.fossil_id, 'missing fossil id');
  assert.equal(fossilize.fossil.mode, 'external_mold', 'taphonomy mode must be honored');
  assert.equal(fossilize.fossil.extinct_lineage_id, lineageId);
  assert.equal(fossilize.fossil.conservation_quality, 2 / 3);

  const strata = await adapter.executePrimitive('fossil_strata', {});
  assert(strata.success && strata.total_strata >= 1, 'orchestrator cannot list strata');
  assert(strata.strata.some((s) => s.stratum_id === fossilize.fossil.stratum_id));

  const excavated = await adapter.executePrimitive('fossil_excavate', { fossilId: fossilize.fossil.fossil_id });
  assert(excavated.success, 'orchestrator cannot excavate');
  assert(excavated.read_only === true && excavated.resurrection === 'forbidden');
  assert(excavated.integrity_verified, 'excavated fossil must verify');

  const decoded = await adapter.executePrimitive('fossil_decode', { fossilId: fossilize.fossil.fossil_id });
  assert(decoded.success, 'orchestrator cannot decode');
  assert.equal(decoded.reading.inferred_class, 'safe_success');
}

async function run() {
  console.log('=== Test Suite: Orchestrator fossilization dispatch ===\n');
  const dbPath = path.join(os.tmpdir(), `genos_orch_fossil_${Date.now()}.db`);
  const db = await getDatabase(dbPath);
  try {
    await testDispatch();
    console.log('   ✓ fossilize / strata / excavate / decode dispatched at will');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  }
  console.log('\nAll orchestrator fossilization tests passed.');
}

run().catch((error) => {
  console.error('Orchestrator fossilization failure:', error);
  process.exit(1);
});
