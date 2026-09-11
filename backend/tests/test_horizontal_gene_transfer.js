const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING HORIZONTAL GENE TRANSFER (CONJUGATION & BDELLOID ABSORPTION) ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_horizontal_gene_transfer', {
    action: 'status',
    target_agent_id: 'agent-bacteria-b'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.plasmids.length, 1);
  console.log('✅ PASS: Initial plasmid state verified');

  // 2. Bacterial conjugation: transfer resistance plasmid from agent A to agent B
  const conjRes = await executeBioTool('genos_biomimicry_horizontal_gene_transfer', {
    action: 'conjugate_bacterial_plasmid',
    source_agent_id: 'agent-bacteria-a',
    target_agent_id: 'agent-bacteria-b',
    plasmid_name: 'pRESISTANCE_ANTIBIOTIC_BYPASS'
  });
  assert.strictEqual(conjRes.success, true);
  assert.strictEqual(conjRes.plasmid_transferred, 'pRESISTANCE_ANTIBIOTIC_BYPASS');
  assert.ok(conjRes.target_plasmids.includes('pRESISTANCE_ANTIBIOTIC_BYPASS'));
  console.log('✅ PASS: Bacterial plasmid successfully conjugated via pilus bridge');

  // 3. Bdelloid rotifer environmental DNA absorption
  const absorbRes = await executeBioTool('genos_biomimicry_horizontal_gene_transfer', {
    action: 'absorb_bdelloid_environmental_dna',
    target_agent_id: 'agent-bdelloid-1',
    environmental_snippets: ['GENE_PLANT_CRYOPROTECTANT', 'GENE_ALGAL_LIGHT_HARVEST']
  });
  assert.strictEqual(absorbRes.success, true);
  assert.strictEqual(absorbRes.absorbed_genes_count, 2);
  assert.ok(absorbRes.xeno_genes.includes('GENE_PLANT_CRYOPROTECTANT'));
  console.log('✅ PASS: Bdelloid xeno-absorption integrated 2 environmental DNA fragments');

  console.log('🎉 ALL HORIZONTAL GENE TRANSFER TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
