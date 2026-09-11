const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING MITOCHONDRIAL DNA MUTATION & MATRILINEAL TRANSMISSION ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_mitochondrial_dna_mutation', {
    action: 'status',
    id: 'mtdna-mother-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.efficiency, 1.0);
  assert.strictEqual(initRes.mutations_count, 0);
  console.log('✅ PASS: Nominal mother mtDNA initial status verified (100% efficiency)');

  // 2. High inference stress: induces oxidative stress mutations
  const stressRes = await executeBioTool('genos_biomimicry_mitochondrial_dna_mutation', {
    action: 'mutate_mtdna_under_stress',
    id: 'mtdna-mother-1',
    stress_level: 2.5
  });
  assert.strictEqual(stressRes.success, true);
  assert.strictEqual(stressRes.new_mutations, 5);
  assert.strictEqual(stressRes.token_energy_efficiency, 0.8);
  console.log('✅ PASS: Stress-induced mutations reduced energy efficiency to 80%');

  // 3. Transmit maternal lineage to child agent
  const transmitRes = await executeBioTool('genos_biomimicry_mitochondrial_dna_mutation', {
    action: 'transmit_maternal_lineage',
    id: 'mtdna-mother-1',
    child_id: 'mtdna-child-1'
  });
  assert.strictEqual(transmitRes.success, true);
  assert.strictEqual(transmitRes.maternal_haplogroup, 'HAPLO_MATERNAL_ORIGIN_ALPHA');
  assert.strictEqual(transmitRes.paternal_mtdna_purged, true);
  assert.strictEqual(transmitRes.generation, 2);
  console.log('✅ PASS: Maternal mtDNA transmitted strictly matrilinially with paternal mtDNA purged');

  console.log('🎉 ALL MITOCHONDRIAL DNA TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
