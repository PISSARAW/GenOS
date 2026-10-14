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
  await assert.rejects(
    () => fossilization.recordFossil({ lineageId: 'lineage_new_strict' }, db),
    /sourceEventId required|source event provenance is required/i,
    'New provenance-bound fossilization must reject missing source events'
  );
  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json)
    VALUES ('event_wrong_lineage', 'other_lineage', 'AGENT_FAILED', 'TERMINATE', 'terminal', '{}')`);
  await assert.rejects(
    () => fossilization.recordFossil({ lineageId: 'lineage_new_strict', sourceEventId: 'event_wrong_lineage' }, db),
    /lineage or scope/i,
    'New fossilization must reject a terminal event from another lineage'
  );
  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json)
    VALUES ('event_nonterminal', 'lineage_new_strict', 'AGENT_STARTED', 'START', 'running', '{}')`);
  await assert.rejects(
    () => fossilization.recordFossil({ lineageId: 'lineage_new_strict', sourceEventId: 'event_nonterminal' }, db),
    /terminal lineage event/i,
    'New fossilization must reject a nonterminal source event'
  );

  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json)
    VALUES ('event_legacy_fixture', 'lineage_db', 'AGENT_TERMINATED', 'TERMINATE', 'historical fixture', '{}')`);
  const first = await fossilization.recordFossil(
    { lineageId: 'lineage_db', sourceEventId: 'event_legacy_fixture', reason: 'apoptosis', mode: 'petrification' }, db
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

  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json)
    VALUES ('event_rewritten_lineage', 'rewritten', 'AGENT_TERMINATED', 'TERMINATE', 'terminal', '{}')`);
  await assert.rejects(
    () => fossilization.recordFossil({ fossilId: first.fossil.fossil_id, lineageId: 'rewritten', sourceEventId: 'event_rewritten_lineage', reason: 'tampered' }, db),
    /constraint|unique/i,
    'Existing fossils must be immutable'
  );

  const missing = await fossilization.excavateFossil(db, 'does-not-exist');
  assert(!missing.success, 'Missing fossil must not be excavatable');
}

async function testProvenanceAcrossRestart(dbPath, db) {
  const lineageId = 'lineage_provenance_restart';
  const sourceEventId = 'event_fossil_source_restart';
  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json)
    VALUES (?, ?, 'AGENT_FAILED', 'TERMINATE', 'lineage exhausted', ?)`,
  sourceEventId, lineageId, JSON.stringify({ reason: 'budget_exhausted', lineageId }));

  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-fossil-artifact-'));
  const previousRoot = process.env.GENOS_STUDIO_ROOT;
  const previousArtifacts = process.env.GENOS_FOSSIL_ARTIFACT;
  process.env.GENOS_STUDIO_ROOT = artifactRoot;
  process.env.GENOS_FOSSIL_ARTIFACT = '1';
  let fossil;
  try {
    const result = await fossilization.recordFossil({
      lineageId, sourceEventId, reason: 'source event fossilization', hardParts: ['lineage', 'source_event']
    }, db);
    assert(result.success, 'Fossil with terminal source event must be indexed');
    fossil = result.fossil;
    const artifactPath = path.join(artifactRoot, 'fossils', `${lineageId}_${fossil.fossil_id}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    assert.equal(artifact.extinct_lineage_id, lineageId);
    assert.equal(artifact.source_event_id, sourceEventId);
    assert.equal(artifact.source_event_hash, fossil.source_event_hash);
    assert.equal(artifact.payload_hash, fossil.payload_hash);
  } finally {
    if (previousRoot === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = previousRoot;
    process.env.GENOS_FOSSIL_ARTIFACT = previousArtifacts;
  }

  await closeDatabase();
  const reopened = await getDatabase(dbPath);
  try {
    const excavated = await fossilization.excavateFossil(reopened, fossil.fossil_id);
    assert(excavated.success && excavated.integrity_verified, 'Fossil and source event must verify after restart');
    assert(excavated.provenance_verified, 'Source event provenance must be explicitly verified');
    assert.equal(excavated.specimen.source_event_id, sourceEventId);
    await reopened.run('UPDATE telemetry_events SET detail = ? WHERE event_id = ?', 'rewritten event', sourceEventId);
    const alteredSource = await fossilization.excavateFossil(reopened, fossil.fossil_id);
    assert(!alteredSource.success && !alteredSource.integrity_verified,
      'Changing the source event after restart must invalidate fossil provenance');
  } finally {
    await closeDatabase();
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
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
    await testProvenanceAcrossRestart(dbPath, db);
    console.log('   ✓ Artifact, terminal event and lineage provenance survive restart and detect source edits');
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
