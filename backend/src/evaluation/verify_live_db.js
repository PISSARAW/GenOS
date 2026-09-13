const { getDatabase } = require('../db');

async function check() {
  const db = await getDatabase();
  const dec = await db.get("SELECT count(id) as c FROM genome_decisions WHERE organization_id = 'benchmark_locomo'");
  const syn = await db.get("SELECT count(source_id) as c FROM memory_synapses WHERE organization_id = 'benchmark_locomo'");
  const sample = await db.get("SELECT source_id, target_id, weight, transmitter_type, receptor_density, nmda_receptors, spine_morphology FROM memory_synapses WHERE organization_id = 'benchmark_locomo' LIMIT 1");
  
  console.log('=== GENOS LIVE DATABASE PROOF ===');
  console.log(`Live Memories in genome_decisions: ${dec.c}`);
  console.log(`Live Synapses in memory_synapses: ${syn.c}`);
  console.log('Sample Synaptic Edge in Connectome:', JSON.stringify(sample, null, 2));
}

check().catch(console.error);
