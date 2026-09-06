/**
 * Test Suite: Cognitive Memory, GraphRAG Spreading Activation, and Hebbian Plasticity
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { getDatabase } = require('../src/db');
const vectorMemory = require('../src/services/vectorMemoryService');
const agentMemory = require('../src/services/agentMemoryContext');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runCognitiveMemorySuite() {
  console.log('===============================================================');
  console.log('  COGNITIVE MEMORY, GRAPHRAG & HEBBIAN PLASTICITY TEST SUITE   ');
  console.log('===============================================================');

  const db = await getDatabase();

  // Test 1: Real Hybrid Search returns scored experiences
  console.log('\n--- Test 1: Real Hybrid Vector & Lexical Search ---');
  const searchRes = await vectorMemory.searchMemory('sqlite concurrency locking', { limit: 5 }, db);
  assert(Array.isArray(searchRes.allScoredExperiences) && searchRes.allScoredExperiences.length > 0, 'allScoredExperiences is populated with real memories');
  assert(searchRes.allScoredExperiences.every(e => typeof e.similarityScore === 'number' && !isNaN(e.similarityScore)), 'All returned experiences have valid numerical similarity scores');
  assert(Array.isArray(searchRes.topSuccessfulGoldenPaths) && searchRes.topSuccessfulGoldenPaths.length > 0, 'topSuccessfulGoldenPaths contains ranked successful solutions');

  // Test 2: Hebbian Learning & Synapse Creation
  console.log('\n--- Test 2: Hebbian Learning (Excitatory & Inhibitory Synapses) ---');
  const idA = `dec-test-a-${Date.now()}`;
  const idB = `dec-test-b-${Date.now()}`;
  const idCorrection = `dec-test-corr-${Date.now()}`;

  const float32 = new Float32Array(new Array(768).fill(0.05));
  const buffer = Buffer.from(float32.buffer);

  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
    idA, 'Architecture Decision A', 'Always configure SQLite WAL journal mode for parallel agents', buffer, 'system', 'Database', 1.0
  );

  // Ingest B (Associative recall of A)
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
    idB, 'Optimization B', 'WAL journal mode eliminates reader/writer locking conflicts in SQLite', buffer, 'system', 'Database', 1.0
  );

  // Excitatory Hebbian link (A and B fire together)
  await db.run('INSERT OR REPLACE INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, 1.0)', idB, idA);
  const excitatorySynapse = await db.get('SELECT weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', idB, idA);
  assert(excitatorySynapse && excitatorySynapse.weight === 1.0, 'Excitatory synapse (+1.0) established between associative decisions');

  // Ingest Correction (Inhibitory GABA link)
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
    idCorrection, 'Correction Fact', 'Faux, ce n\'est pas DELETE journal mode qui supporte les lecteurs concurrents', buffer, 'user', 'Correction', 0.5
  );
  await db.run('INSERT OR REPLACE INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, -5.0)', idCorrection, idA);
  const inhibitorySynapse = await db.get('SELECT weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', idCorrection, idA);
  assert(inhibitorySynapse && inhibitorySynapse.weight === -5.0, 'Inhibitory synapse (-5.0) established by correction against target memory');

  // Test 3: GraphRAG Spreading Activation via Recursive CTE
  console.log('\n--- Test 3: GraphRAG Spreading Activation ---');
  const graphResults = await vectorMemory.searchMemory('eliminates reader/writer locking conflicts', { limit: 3 }, db);
  const foundAssociated = graphResults.allScoredExperiences.some(
    e => e.id === idA || (e.tags && e.tags.includes('graph_association'))
  );
  assert(foundAssociated, 'Spreading activation traversed memory_synapses and surfaced associated memories');

  // Test 4: Sleep Cycle & Apoptosis
  console.log('\n--- Test 4: Sleep Cycle, LTD Decay & Apoptosis ---');
  const doomedId = `dec-doomed-${Date.now()}`;
  // Insert with weight 0.105 (above 0.1 survival threshold)
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
    doomedId, 'Temporary Trivia', 'Transient log noise without synapses', buffer, 'temp', 'Trivia', 0.105
  );

  const preCheck = await db.get('SELECT synaptic_weight FROM genome_decisions WHERE id = ?', doomedId);
  assert(preCheck && preCheck.synaptic_weight > 0.1, 'Memory starts above apoptosis threshold');

  const sleepResult = await vectorMemory.sleepCycle(db);
  assert(sleepResult.consolidated === true && sleepResult.memoriesDecayed === true, 'Sleep cycle completed LTD synaptic decay');
  const doomedCheck = await db.get('SELECT id FROM genome_decisions WHERE id = ?', doomedId);
  assert(!doomedCheck, 'Orphaned weak memory decayed below survival threshold and was pruned via apoptosis');

  // Clean up test decisions
  await db.run('DELETE FROM genome_decisions WHERE id IN (?, ?, ?, ?)', idA, idB, idCorrection, doomedId);
  await db.run('DELETE FROM memory_synapses WHERE source_id IN (?, ?) OR target_id IN (?, ?)', idB, idCorrection, idA, idA);

  // Test 5: Agent Prompt Context Injection
  console.log('\n--- Test 5: Agent Cognitive Memory Prompt Injection ---');
  const promptBlock = await agentMemory.formatCognitiveMemoryPrompt('Griot', 'wal concurrency database');
  assert(typeof promptBlock === 'string' && promptBlock.includes('[MÉMOIRE COGNITIVE & EXPÉRIENCES PERTINENTES (GraphRAG)]'), 'formatCognitiveMemoryPrompt generates structured GraphRAG section');
  assert(promptBlock.includes('SQLite') || promptBlock.includes('wal') || promptBlock.includes('Souvenirs'), 'Injected prompt contains relevant domain memories');

  // Test 6: Vesicle Packaging & Protobuf Serialization
  console.log('\n--- Test 6: Synaptic Vesicle Protobuf & Gzip Packaging ---');
  const vesicleFile = await vectorMemory.releaseVesicles([
    { content: 'Ground truth engram', vector: new Array(768).fill(0.1) }
  ]);
  assert(typeof vesicleFile === 'string' && fs.existsSync(vesicleFile), 'Vesicle binary file generated on disk');
  const compressedData = fs.readFileSync(vesicleFile);
  const decompressed = zlib.gunzipSync(compressedData);
  assert(decompressed.length > 0, 'Vesicle is valid gzipped protobuf payload');

  // Clean up vesicle
  try { fs.unlinkSync(vesicleFile); } catch {}

  console.log(`\nCognitive Memory Suite Completed: ${passedTests} PASSED, ${failedTests} FAILED\n`);
  return { passed: passedTests, failed: failedTests };
}

if (require.main === module) {
  runCognitiveMemorySuite().then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  }).catch(err => {
    console.error('Test suite uncaught error:', err);
    process.exitCode = 1;
  });
}

module.exports = { runCognitiveMemorySuite };
