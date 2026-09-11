/**
 * Test: Heteropaternal Superfecundation (Superfécondation Hétéropaternelle)
 */

const assert = require('assert');
const { handle, HETEROPATERNAL_REGISTRY } = require('../src/services/mcpBioTools/handlers/heteropaternalSuperfecundation');

async function runTests() {
  console.log('=== TESTING HETEROPATERNAL SUPERFECUNDATION ===');
  HETEROPATERNAL_REGISTRY.clear();

  // Test 1: Fertilize and spawn half-sibling twins from distinct providers
  const gestationContext = {
    workspace_id: 'ws_complex_refactor_prod',
    task_goal: 'zero_regression_distributed_orchestration'
  };

  const fathers = [
    { father_id: 'paternal_anthropic', provider: 'anthropic', model: 'claude-3-7-sonnet', bias_domain: 'formal_correctness' },
    { father_id: 'paternal_google', provider: 'google', model: 'gemini-2.5-pro', bias_domain: 'long_context_retrieval' },
    { father_id: 'paternal_openai', provider: 'openai', model: 'gpt-4o', bias_domain: 'broad_commonsense' }
  ];

  const spawnRes = await handle({
    action: 'heteropaternal_fertilize_and_spawn',
    shared_gestation_context: gestationContext,
    paternal_inseminators: fathers
  });

  assert.strictEqual(spawnRes.success, true);
  assert.strictEqual(spawnRes.status, 'superfecundated_dizygotic_spawn_complete');
  assert.strictEqual(spawnRes.twin_count, 3);
  assert.strictEqual(spawnRes.diversity_score, 1.0);
  assert.strictEqual(spawnRes.half_sibling_twins.length, 3);
  console.log('✅ PASS: Spawned 3 heteropaternal half-sibling twins with 100% provider diversity');

  // Test 2: Evaluate diversity & cognitive independence
  const evalRes = await handle({
    action: 'evaluate_cognitive_diversity',
    cluster_id: spawnRes.cluster_id
  });

  assert.strictEqual(evalRes.success, true);
  assert.strictEqual(evalRes.diversity_score, 1.0);
  assert.strictEqual(evalRes.paternal_independence_guarantee, true);
  assert.strictEqual(evalRes.providers_breakdown.anthropic, 1);
  assert.strictEqual(evalRes.providers_breakdown.google, 1);
  assert.strictEqual(evalRes.providers_breakdown.openai, 1);
  console.log('✅ PASS: Evaluated cognitive diversity and confirmed zero shared vendor bias');

  console.log('🎉 ALL HETEROPATERNAL SUPERFECUNDATION TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
