const assert = require('assert');
const { getDatabase } = require('../src/db');

async function runDendriticSuite() {
  console.log('=== TEST DENDRITIC TREES, COMPARTMENTS & SPINE MORPHOLOGY ===');
  const db = await getDatabase();

  const columns = await db.all('PRAGMA table_info(memory_synapses)');
  const colNames = new Set(columns.map(c => c.name));

  assert.ok(colNames.has('spine_morphology'), 'memory_synapses doit avoir spine_morphology');
  assert.ok(colNames.has('compartment_type'), 'memory_synapses doit avoir compartment_type');
  assert.ok(colNames.has('electrotonic_dist'), 'memory_synapses doit avoir electrotonic_dist');
  assert.ok(colNames.has('nmda_receptors'), 'memory_synapses doit avoir nmda_receptors');
  console.log('  PASS: Schema SQLite memory_synapses aligne avec les compartiments et epines');

  const srcId = 'dendrite_test_node_A';
  const targetId = 'dendrite_test_node_B';

  await db.run('DELETE FROM memory_synapses WHERE source_id = ? OR target_id = ?', srcId, targetId);
  await db.run('DELETE FROM genome_decisions WHERE id IN (?, ?)', srcId, targetId);

  await db.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight)
     VALUES (?, 'Dendritic Tree Modeling', 'Biophysical compartmental model', 'admin', 'Architecture', 1.0),
            (?, 'Rall Cable Integration', 'Electrotonic attenuation', 'admin', 'Architecture', 1.0)`,
    srcId, targetId
  );

  await db.run(
    `INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type, receptor_density, spine_morphology, compartment_type, electrotonic_dist, activity_history)
     VALUES (?, ?, 1.0, 'glutamate', 1.0, 'thin', 'apical', 0.75, 1)`,
    srcId, targetId
  );

  let synapse = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', srcId, targetId);
  assert.strictEqual(synapse.spine_morphology, 'thin');
  assert.strictEqual(synapse.compartment_type, 'apical');
  assert.strictEqual(synapse.electrotonic_dist, 0.75);
  console.log('  PASS: Insertion initiale d epine Thin sur compartiment Apical');

  for (let i = 0; i < 11; i++) {
    await db.run(
      `UPDATE memory_synapses
       SET weight = MIN(20.0, weight + 0.5),
           activity_history = activity_history + 1,
           receptor_density = MIN(3.0, receptor_density + 0.05),
           spine_morphology = CASE WHEN receptor_density + 0.05 >= 1.5 THEN 'mushroom' ELSE 'thin' END
       WHERE source_id = ? AND target_id = ?`,
      srcId, targetId
    );
  }

  synapse = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', srcId, targetId);
  assert.strictEqual(synapse.spine_morphology, 'mushroom');
  assert.ok(synapse.receptor_density >= 1.5);
  console.log('  PASS: Transition morphologique vers Mushroom validee');

  await db.run('UPDATE memory_synapses SET activity_history = 0 WHERE source_id = ? AND target_id = ?', srcId, targetId);
  
  for (let i = 0; i < 10; i++) {
    await db.run(
      `UPDATE memory_synapses
      SET weight = ROUND(weight * 0.95, 4),
          receptor_density = MAX(0.0, receptor_density - 0.05),
          c3_opsonization = MIN(2.0, c3_opsonization + 0.1),
          cd47_expression = MAX(0.0, cd47_expression - 0.05),
          spine_morphology = CASE WHEN receptor_density - 0.05 < 0.6 THEN 'filopodia' WHEN receptor_density - 0.05 < 1.3 THEN 'stubby' ELSE spine_morphology END
      WHERE source_id = ? AND target_id = ?`,
      srcId, targetId
    );
  }

  synapse = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', srcId, targetId);
  assert.strictEqual(synapse.spine_morphology, 'stubby');
  assert.ok(synapse.c3_opsonization > 0.5);
  console.log('  PASS: Retraction morphologique vers Stubby avec opsonisation C3');

  await db.run('DELETE FROM memory_synapses WHERE source_id = ? OR target_id = ?', srcId, targetId);
  await db.run('DELETE FROM genome_decisions WHERE id IN (?, ?)', srcId, targetId);

  // Validation des calculs biophysiques alignés avec neurobiology.rs
  const { calculateRallAttenuation, evaluateNmdaSpike, normalizeCompartment, normalizeSpineMorphology } = require('../src/services/neurobiologyBiophysics');
  const vAttenuated = calculateRallAttenuation(10.0, 1.0, 1.0);
  assert.ok(Math.abs(vAttenuated - (10.0 * Math.exp(-1.0))) < 0.01, 'Atténuation de Rall doit correspondre à V0 * exp(-x/lambda)');

  const subthreshold = evaluateNmdaSpike(1.0, 1.0, 1.5);
  assert.strictEqual(subthreshold.isNmdaSpike, false);

  const supralinear = evaluateNmdaSpike(1.5, 2.0, 1.2);
  assert.strictEqual(supralinear.isNmdaSpike, true);
  assert.ok(supralinear.voltage > 1.5 * 1.8, 'Spike NMDA supralinéaire validé');

  assert.strictEqual(normalizeCompartment('apical'), 'ApicalDendrite');
  assert.strictEqual(normalizeCompartment('trunk'), 'ProximalTrunk');
  assert.strictEqual(normalizeSpineMorphology('mushroom'), 'Mushroom');
  console.log('  PASS: Module biophysique Rall & NMDA synchronise avec neurobiology.rs');

  console.log('=== TOUS LES TESTS DENDRITIQUES BACKEND ONT REUSSI ===');
}

runDendriticSuite().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
