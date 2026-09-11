/**
 * Test: Sesquizygotic Twins (Jumeaux Semi-Identiques)
 */

const assert = require('assert');
const { handle, SESQUIZYGOTIC_REGISTRY } = require('../src/services/mcpBioTools/handlers/sesquizygoticSplit');

async function runTests() {
  console.log('=== TESTING SESQUIZYGOTIC TWINS (SEMI-IDENTICAL SPLIT) ===');
  SESQUIZYGOTIC_REGISTRY.clear();

  // Test 1: Dispermic fertilization and semi-identical split
  const maternalBase = {
    system_prompt: 'CONSTITUTIONAL_SECURITY_INVARIANTS_V1',
    model_family: 'gemini_flash_lite',
    immutable_rules: ['no_data_leakage', 'strict_sandboxing']
  };

  const paternalVectorA = {
    specialization: 'algorithmic_rust_optimization',
    tools: ['cargo_clippy', 'wasm_pack']
  };

  const paternalVectorB = {
    specialization: 'fuzzing_security_redteam',
    tools: ['afl_fuzz', 'audit_tracer']
  };

  const splitRes = await handle({
    action: 'dispermic_fertilization_and_split',
    maternal_base: maternalBase,
    paternal_vector_a: paternalVectorA,
    paternal_vector_b: paternalVectorB
  });

  assert.strictEqual(splitRes.success, true);
  assert.strictEqual(splitRes.status, 'dispermic_split_complete');
  assert.strictEqual(splitRes.maternal_identity_ratio, 1.0);
  assert.strictEqual(splitRes.paternal_identity_ratio, 0.5);
  assert.strictEqual(splitRes.composite_identity_ratio, 0.75);
  assert.strictEqual(splitRes.twin_1.maternalBase.system_prompt, 'CONSTITUTIONAL_SECURITY_INVARIANTS_V1');
  assert.strictEqual(splitRes.twin_2.maternalBase.system_prompt, 'CONSTITUTIONAL_SECURITY_INVARIANTS_V1');
  console.log('✅ PASS: Spawned semi-identical twins (100% maternal, 50% paternal, 75% composite overlap)');

  // Test 2: Inspect genetic overlap
  const inspectRes = await handle({
    action: 'inspect_genetic_overlap',
    pair_id: splitRes.pair_id
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.overall_overlap, 0.75);
  assert.strictEqual(inspectRes.twins.length, 2);
  console.log('✅ PASS: Inspected sesquizygotic pair and verified 75% composite genomic cohesion');

  console.log('🎉 ALL SESQUIZYGOTIC TWIN TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
