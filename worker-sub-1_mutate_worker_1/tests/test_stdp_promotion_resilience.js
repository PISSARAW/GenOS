const assert = require('assert');
const { getDatabase } = require('../src/db');
const memoryPrimitives = require('../src/services/primitiveHandlers/memory');

async function testStdpPromotionResilience() {
  console.log('=== TEST : Resilience STDP dans le pipeline de promotion ===');
  const db = await getDatabase();
  const agentId = `agent_promo_${Date.now()}`;

  // Cas 1 : Aucun argument, aucun souvenir préalable -> Doit skipper gracieusement sans bloquer le pipeline
  const skipRes = await memoryPrimitives.stdpUpdate({ agentId });
  assert.strictEqual(skipRes.success, true, 'STDP doit réussir (skip gracieux) même sans sourceId/targetId');
  assert.strictEqual(skipRes.skipped, true, 'Le flag skipped doit être true');
  console.log('-> Cas 1 Validé : Skip gracieux sans échec du pipeline de promotion.');

  // Cas 2 : Agent avec 2 décisions récentes -> Doit auto-lier les décisions pré et post
  const dec1 = `dec_pre_${Date.now()}`;
  const dec2 = `dec_post_${Date.now()}`;
  const dummyBuf = Buffer.from(new Float32Array(768).buffer);
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, ?, ?)',
    dec1, 'Pre-synaptic Cause', 'First step resolution', agentId, 'Experience', dummyBuf
  );
  // Simuler un léger décalage temporel
  await new Promise(r => setTimeout(r, 15));
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, ?, ?)',
    dec2, 'Post-synaptic Outcome', 'Second step breakthrough', agentId, 'Experience', dummyBuf
  );

  const autoRes = await memoryPrimitives.stdpUpdate({ agentId });
  assert.strictEqual(autoRes.success, true, 'STDP auto-associatif doit réussir');
  assert.strictEqual(autoRes.sourceId, dec1, 'La décision antérieure doit être la cause pré-synaptique');
  assert.strictEqual(autoRes.targetId, dec2, 'La décision postérieure doit être l effet post-synaptique');
  assert.ok(autoRes.newWeight >= 0.01, 'Le poids doit être une conductance valide');
  console.log(`-> Cas 2 Validé : Auto-association causale (${dec1} -> ${dec2}) avec poids ${autoRes.newWeight}.`);

  // Nettoyage
  await db.run('DELETE FROM genome_decisions WHERE id IN (?, ?)', dec1, dec2);
  await db.run('DELETE FROM memory_synapses WHERE source_id = ? AND target_id = ?', dec1, dec2);
  console.log('=== TEST DE RÉSILIENCE DE PROMOTION STDP RÉUSSI ===');
}

testStdpPromotionResilience().catch((err) => {
  console.error('Échec du test de résilience STDP :', err);
  process.exit(1);
});
