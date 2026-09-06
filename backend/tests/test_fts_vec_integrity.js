/**
 * Test Suite: FTS5 & sqlite-vec Integration Integrity
 * Verifies triggers, dimension handling, unicode sanitization, RRF decoupling, and bootstrap syncing.
 */

const assert = require('assert');
const { getDatabase } = require('../src/db');
const { VectorMemoryService } = require('../src/services/vectorMemoryService');
const { textToVector } = require('../src/services/memoryScoring');

async function runFtsVecIntegrityTests() {
  console.log('=================================================================');
  console.log('       FTS5 & SQLITE-VEC HYBRID SEARCH INTEGRITY SUITE           ');
  console.log('=================================================================');

  const db = await getDatabase();
  const memoryService = new VectorMemoryService();

  // Test 1: textToVector fallback 768-dim guarantee
  console.log('\n--- Test 1: textToVector 768-dim Fallback Normalization ---');
  const vecEmpty = textToVector('');
  assert.strictEqual(vecEmpty.length, 768, 'Empty textToVector must have 768 dimensions');
  const vecFrench = textToVector('génome et différenciation cellulaire autopoïèse');
  assert.strictEqual(vecFrench.length, 768, 'French textToVector must have 768 dimensions');
  const normSq = vecFrench.reduce((acc, v) => acc + v * v, 0);
  assert(Math.abs(Math.sqrt(normSq) - 1.0) < 1e-4, 'textToVector must be L2 normalized');
  console.log('  ✅ PASS: textToVector produces valid 768-dim L2-normalized vector');

  // Test 2: Trigger resilience with NULL embedding
  console.log('\n--- Test 2: sqlite-vec Trigger NOT NULL & Update Atomicity ---');
  await db.exec('BEGIN');
  try {
    const testTrajId = 'traj-test-null-' + Date.now();
    await db.run(
      `INSERT INTO trajectories (id, workspace_id, author_id, author_name, title, status, semantic_summary, diff_file, diff_lines, confidence, embedding_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [testTrajId, null, 'tester', 'tester', 'Null Vec Trajectory', 'active', 'Testing null vector trigger', 'test.ts', '[]', 1.0, null]
    );
    const row = await db.get('SELECT rowid FROM trajectories WHERE id = ?', testTrajId);
    assert(row, 'Row must exist in trajectories');

    const vecEntry1 = await db.get('SELECT * FROM trajectories_vec WHERE rowid = ?', row.rowid);
    assert.strictEqual(vecEntry1, undefined, 'trajectories_vec must not have entry for NULL embedding');

    // Update with 768-dim Float32Array (3072 bytes)
    const valid768 = new Float32Array(768).fill(0.25);
    const buf768 = Buffer.from(valid768.buffer);
    await db.run('UPDATE trajectories SET embedding_blob = ? WHERE id = ?', [buf768, testTrajId]);

    const vecEntry2 = await db.get('SELECT rowid FROM trajectories_vec WHERE rowid = ?', row.rowid);
    assert(vecEntry2, 'trajectories_vec must contain rowid after updating to valid 768-dim blob');

    // Update back to NULL
    await db.run('UPDATE trajectories SET embedding_blob = NULL WHERE id = ?', [testTrajId]);
    const vecEntry3 = await db.get('SELECT * FROM trajectories_vec WHERE rowid = ?', row.rowid);
    assert.strictEqual(vecEntry3, undefined, 'trajectories_vec entry must be pruned on NULL update');
    console.log('  ✅ PASS: Triggers safely handle NULL insertions, valid updates, and NULL resets');

    // Test 3: FTS5 Unicode & Multilingual Tokenization
    console.log('\n--- Test 3: FTS5 Accents & Francophone Lexical Matching ---');
    const testDecisionId = 'dec-test-french-' + Date.now();
    await db.run(
      `INSERT INTO genome_decisions (id, title, category, content, created_by, synaptic_weight, embedding_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [testDecisionId, 'Optimisation du génome épigénétique', 'Architecture', 'Différenciation cellulaire et autopoïèse biologique', 'BioArchitect', 1.0, buf768]
    );

    // Decoupled FTS query with accented terms
    const ftsResults = await memoryService.fetchCorpus(db, "l'autopoïèse et le génome", null, {});
    const ftsMatch = ftsResults.find(r => r.id === testDecisionId);
    assert(ftsMatch, "FTS5 search must preserve 'génome' and 'autopoïèse' and find the decision");
    console.log('  ✅ PASS: Accented French query matches FTS5 index properly');

    // Test 4: Decoupled RRF Hybrid Search
    console.log('\n--- Test 4: Decoupled RRF Search (Vector-only, FTS-only, and Hybrid) ---');
    // 4a. FTS-only (no queryVec)
    const resFtsOnly = await memoryService.fetchCorpus(db, 'Différenciation', null, {});
    assert(resFtsOnly.some(r => r.id === testDecisionId), 'Must find item with FTS query when queryVec is null');

    // 4b. Vector-only (non-matching text query)
    const resVecOnly = await memoryService.fetchCorpus(db, 'completely_unknown_token_xyz_999', Array.from(valid768), {});
    assert(resVecOnly.some(r => r.id === testDecisionId), 'Must find item via vector match when FTS tokens do not match');

    // 4c. Hybrid with RRF scoring
    const resHybrid = await memoryService.fetchCorpus(db, 'Différenciation', Array.from(valid768), {});
    const hybridItem = resHybrid.find(r => r.id === testDecisionId);
    assert(hybridItem && hybridItem.rrf_score > 0, 'Hybrid item must have combined RRF score');
    console.log('  ✅ PASS: Vector-only, FTS-only, and hybrid queries all resolve independently');

  } finally {
    await db.exec('ROLLBACK').catch(() => {});
  }

  await db.close();
  console.log('\n=================================================================');
  console.log('  ALL FTS5 & SQLITE-VEC INTEGRITY TESTS PASSED (4/4)             ');
  console.log('=================================================================\n');
}

runFtsVecIntegrityTests().catch(err => {
  console.error('\n❌ Integrity suite failed:', err);
  process.exit(1);
});
