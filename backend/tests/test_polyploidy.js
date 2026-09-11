const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING GENOMIC POLYPLOIDY ===');

  // 1. Initial status (Diploid 2n)
  const initRes = await executeBioTool('genos_biomimicry_polyploidy', {
    action: 'status',
    id: 'poly-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.ploidy_level, 2);
  console.log('✅ PASS: Initial diploid genome status verified (2n)');

  // 2. Multiply to Hexaploid (6n - Wheat Strategy)
  const hexRes = await executeBioTool('genos_biomimicry_polyploidy', {
    action: 'multiply_genome_ploidy',
    id: 'poly-test-1',
    ploidy_level: 6
  });
  assert.strictEqual(hexRes.success, true);
  assert.strictEqual(hexRes.ploidy_level, 6);
  assert.strictEqual(hexRes.layers_count, 6);
  assert.strictEqual(hexRes.layers[0].role, 'AST Core Logic');
  assert.strictEqual(hexRes.layers[5].role, 'Explanatory Documentation & Specs');
  console.log('✅ PASS: Multiplied to Hexaploid (6n) with 6 specialized functional layers');

  // 3. Orchestrate polyploid multi-layers
  const orchRes = await executeBioTool('genos_biomimicry_polyploidy', {
    action: 'orchestrate_polyploid_layers',
    id: 'poly-test-1'
  });
  assert.strictEqual(orchRes.success, true);
  assert.ok(orchRes.topology.includes('Layer 1'));
  assert.ok(orchRes.topology.includes('Layer 6'));
  console.log('✅ PASS: Multi-layer polyploid orchestration verified');

  console.log('🎉 ALL POLYPLOIDY TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
