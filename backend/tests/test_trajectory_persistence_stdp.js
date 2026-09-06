const assert = require('assert');
const { getDatabase } = require('../src/db');
const trajectoryService = require('../src/services/trajectoryService');
const memoryPrimitives = require('../src/services/primitiveHandlers/memory');

async function runTests() {
  console.log('=== TEST 1 : Enregistrement de Trajectoire & Indexation FTS5/vec0 ===');
  const db = await getDatabase();
  const testTrajId = `traj_test_${Date.now()}`;
  await db.run(
    "INSERT OR IGNORE INTO workspaces (id, name, path, language) VALUES (?, ?, ?, 'JavaScript')",
    'ws-test-stdp', 'STDP test workspace', process.cwd()
  );
  const mockTurns = [
    { step: 1, action: 'view_file', detail: 'Exploration du code source', pass: true },
    { step: 2, action: 'run_command', detail: 'SyntaxError dans le script', error: 'SyntaxError', pass: false },
    { step: 3, action: 'replace_file_content', detail: 'Correction du bug et application du patch', pass: true },
    { step: 4, action: 'run_test', cmd: 'npm test', detail: 'Tests passés avec succès', pass: true }
  ];

  const recordResult = await trajectoryService.recordMissionTrajectory(db, {
    id: testTrajId,
    agentId: 'test_agent_omega',
    workspaceId: 'ws-test-stdp',
    task: 'Résoudre le problème de concurrence WAL SQLite',
    report: {
      outcome: 'success',
      claims: [{ statement: 'Mode WAL activé sans interblocage', evidence: ['test_wal.js'] }]
    },
    turns: mockTurns,
    status: 'approved'
  });

  assert.ok(recordResult.success, 'La trajectoire doit être enregistrée avec succès');
  assert.strictEqual(recordResult.trajectoryId, testTrajId);
  assert.ok(recordResult.goldenPath.prunedStepCount === 1, 'L étape d erreur doit être élaguée');
  assert.strictEqual(recordResult.goldenPath.noiseReductionPercent, 25);
  console.log(`-> Cas 1.1 Validé : Golden-Path synthétisée avec ${recordResult.goldenPath.noiseReductionPercent}% de réduction de bruit.`);

  // Vérifier la présence dans la table trajectories
  const trajRow = await db.get('SELECT * FROM trajectories WHERE id = ?', testTrajId);
  assert.ok(trajRow, 'La trajectoire doit être présente dans la table SQLite trajectories');
  assert.strictEqual(trajRow.status, 'pending');
  assert.ok(trajRow.embedding_blob && trajRow.embedding_blob.length > 0, 'L embedding_blob 768-dim doit être stocké');
  console.log('-> Cas 1.2 Validé : Ligne insérée dans la table trajectories avec embedding blob.');

  // Vérifier les triggers SQLite : FTS5
  const ftsRow = await db.get('SELECT * FROM trajectories_fts WHERE id = ?', testTrajId);
  assert.ok(ftsRow, 'Le trigger FTS5 trajectories_ai doit avoir peuplé trajectories_fts');
  console.log('-> Cas 1.3 Validé : Trigger FTS5 actif et indexé.');

  console.log('=== TEST 2 : Primitive cherryPickGoldenPath & Dual Persistence ===');
  const cherryResult = await memoryPrimitives.cherryPickGoldenPath({
    agentId: 'test_agent_omega',
    workspaceId: 'ws-test-stdp',
    task: 'Optimisation de la boucle MCTS UCB1',
    report: { outcome: 'success', claims: [{ statement: 'MCTS UCB1 optimisé', evidence: ['bench.js'] }] },
    turns: mockTurns
  });
  assert.ok(cherryResult.success, 'cherryPickGoldenPath doit réussir');
  assert.ok(cherryResult.decisionId, 'Un decisionId doit être généré pour genome_decisions');
  assert.ok(cherryResult.trajectoryId, 'Un trajectoryId doit être généré pour trajectories');

  // Vérifier la présence dans genome_decisions
  const decRow = await db.get('SELECT * FROM genome_decisions WHERE id = ?', cherryResult.decisionId);
  assert.ok(decRow, 'La décision doit être présente dans genome_decisions');
  console.log('-> Cas 2.1 Validé : Persistance double confirmée (genome_decisions + trajectories).');

  console.log('=== TEST 3 : Renforcement Synaptique Hebbien (STDP Update) ===');
  const stdpTargetId = `dec-stdp-target-${Date.now()}`;
  const stdpBuffer = Buffer.from(new Float32Array(768).buffer);
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, ?, ?)',
    stdpTargetId, 'STDP target', 'Post-synaptic outcome', 'test_agent_omega', 'Experience', stdpBuffer
  );

  // Cas 3.1 : potentiation lorsque le spike pré-synaptique précède le post-synaptique
  const stdpAuto = await memoryPrimitives.stdpUpdate({
    sourceId: decRow.id,
    targetId: stdpTargetId,
    preSpikeAt: 1000,
    postSpikeAt: 1010,
    learningRate: 1.5,
    transmitterType: 'glutamate'
  });
  assert.ok(stdpAuto.success, 'STDP pré-post doit réussir avec des clés et timestamps valides');
  assert.ok(stdpAuto.sourceId && stdpAuto.targetId, 'Des IDs source et cible valides doivent être liés');
  
  // Vérifier dans memory_synapses
  const synRow = await db.get(
    'SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?',
    stdpAuto.sourceId, stdpAuto.targetId
  );
  assert.ok(synRow, 'La synapse doit exister dans la table memory_synapses');
  assert.ok(synRow.weight > 0 && synRow.delta_t_ms === 10, 'Le poids et le timing pré/post doivent être persistés');
  assert.ok(synRow.receptor_density > 1 && synRow.c3_opsonization === 0, 'La LTP doit renforcer les récepteurs et effacer C3');
  console.log(`-> Cas 3.1 Validé : Synapse créée avec poids ${synRow.weight} dans memory_synapses.`);

  // Cas 3.2 : dépression lorsque le spike post-synaptique précède le pré-synaptique
  const stdpReinforce = await memoryPrimitives.stdpUpdate({
    sourceId: stdpAuto.sourceId,
    targetId: stdpAuto.targetId,
    preSpikeAt: 1010,
    postSpikeAt: 1000,
    learningRate: 2.0,
    transmitterType: 'gaba'
  });
  assert.ok(stdpReinforce.success);
  assert.ok(stdpReinforce.newWeight < synRow.weight, 'Le poids synaptique doit diminuer en LTD');
  const ltdRow = await db.get('SELECT receptor_density, c3_opsonization FROM memory_synapses WHERE source_id = ? AND target_id = ?', stdpAuto.sourceId, stdpAuto.targetId);
  assert.ok(ltdRow.receptor_density < synRow.receptor_density && ltdRow.c3_opsonization > 0, 'La LTD doit rétracter les récepteurs et marquer C3');
  console.log(`-> Cas 3.2 Validé : Dépression temporelle (${synRow.weight} -> ${stdpReinforce.newWeight}).`);

  console.log('=== TOUS LES TESTS DE PERSISTANCE DE TRAJECTOIRE ET STDP ONT RÉUSSI ===');
}

runTests().catch((err) => {
  console.error('Échec du test :', err);
  process.exit(1);
});
