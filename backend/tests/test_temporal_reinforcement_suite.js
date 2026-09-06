const assert = require('assert');
const { getDatabase } = require('../src/db');
const memoryPrimitives = require('../src/services/primitiveHandlers/memory');
const temporalPrimitives = require('../src/services/primitiveHandlers/temporal');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');

async function runTemporalSuite() {
  console.log('=== TEST TEMPORAL REINFORCEMENT & CAUSAL PRIMITIVES ===');
  const db = await getDatabase();
  const sId = 'node_src_' + Date.now();
  const tId = 'node_tgt_' + Date.now();
  const dummyBuf = Buffer.from(new Float32Array(768).buffer);
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, "Src", "A", "ag_test", "Experience", ?)', sId, dummyBuf);
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, "Tgt", "B", "ag_test", "Experience", ?)', tId, dummyBuf);

  const ltpRes = await memoryPrimitives.stdpUpdate({ sourceId: sId, targetId: tId, preSpikeAt: 1000, postSpikeAt: 1020, learningRate: 1.0, transmitterType: 'glutamate' });
  assert.ok(ltpRes.success && ltpRes.newWeight > 0, 'LTP doit reussir');
  const synLTP = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', sId, tId);
  assert.strictEqual(synLTP.c3_opsonization, 0, 'LTP efface C3');

  const ltdRes = await memoryPrimitives.stdpUpdate({ sourceId: sId, targetId: tId, preSpikeAt: 1020, postSpikeAt: 1000, learningRate: 0.5, transmitterType: 'gaba' });
  assert.ok(ltdRes.success && ltdRes.newWeight < synLTP.weight, 'LTD doit diminuer le poids');
  const synLTD = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', sId, tId);
  assert.ok(synLTD.c3_opsonization > 0, 'LTD marque C3');
  console.log('  PASS: STDP LTP et LTD fonctionnent avec directionnalite et marqueurs C3');

  const autoStdp = await memoryPrimitives.stdpUpdate({ agentId: 'ag_test' });
  assert.ok(autoStdp.success, 'STDP auto-fallback reussi');
  console.log('  PASS: STDP pipeline auto-fallback fonctionne');

  const mergeRes = await temporalPrimitives.causalMerge({ base: { a: 1, b: 2 }, left: { a: 10, b: 2 }, right: { a: 1, b: 20 } });
  assert.ok(mergeRes.success && mergeRes.merged.a === 10 && mergeRes.merged.b === 20, 'Merge 3 voies');
  console.log('  PASS: Causal 3-way merge valide');

  const foldRes = await strategyAdapter.executePrimitive('state_fold', { turns: [{ action: 'edit' }, { action: 'test', pass: true }] });
  assert.ok(foldRes.success, 'state_fold via adapter');
  console.log('  PASS: state_fold primitive executee');

  const diffRes = await strategyAdapter.executePrimitive('causal_diff', { baseline: [{ step: 1 }], candidate: [{ step: 2 }] });
  assert.ok(diffRes.success && diffRes.divergenceCount === 1, 'causal_diff via adapter');
  console.log('  PASS: causal_diff primitive executee');

  const worldsRes = await strategyAdapter.executePrimitive('future_worlds', { branchCount: 3 });
  assert.ok(worldsRes.success && worldsRes.worldCount === 3, 'future_worlds via adapter');
  console.log('  PASS: future_worlds primitive executee');

  const simRes = await strategyAdapter.executePrimitive('similarity', { left: 'foo bar', right: 'foo bar' });
  assert.ok(simRes.success && simRes.similarityScore === 1.0, 'similarity via adapter');
  console.log('  PASS: similarity primitive executee');

  const eqRes = await strategyAdapter.executePrimitive('equivalence_verdict', { score: 0.9, threshold: 0.8 });
  assert.ok(eqRes.success && eqRes.isEquivalent === true, 'equivalence_verdict via adapter');
  console.log('  PASS: equivalence_verdict primitive executee');

  const matRes = await strategyAdapter.executePrimitive('dependency_matrix', { orchestratorId: 'ag_test' });
  assert.ok(matRes.success, 'dependency_matrix via adapter');
  console.log('  PASS: dependency_matrix primitive executee');

  console.log('TOUS LES TESTS DU MODULE TEMPOREL ONT REUSSI !');
}
runTemporalSuite().catch(err => { console.error('Echec:', err); process.exit(1); });
