/**
 * Test: Tissue Chimerism (Chimérisme Tissulaire Compartimenté)
 */

const assert = require('assert');
const { handle, TISSUE_CHIMERISM_REGISTRY } = require('../src/services/mcpBioTools/handlers/tissueChimerism');

async function runTests() {
  console.log('=== TESTING TISSUE CHIMERISM (COMPARTMENTALIZED DUAL DNA) ===');
  TISSUE_CHIMERISM_REGISTRY.clear();

  // Test 1: Create tissue chimeric agent with compartmentalized DNA lineages
  const agentId = 'chimeric_sentinel_prime';
  const tissueMapping = {
    network_io: {
      lineage_dna: 'dna_strict_sec_alpha',
      temperature: 0.05,
      tools: ['http_fetch', 'auth_verify'],
      policy: 'zero_leakage'
    },
    filesystem_refactor: {
      lineage_dna: 'dna_rapid_dev_beta',
      temperature: 0.7,
      tools: ['ast_transform', 'code_edit'],
      policy: 'speculative_mutation'
    }
  };

  const createRes = await handle({
    action: 'create_tissue_chimeric_agent',
    agent_id: agentId,
    tissue_mapping: tissueMapping
  });

  assert.strictEqual(createRes.success, true);
  assert.strictEqual(createRes.status, 'tissue_chimerism_active');
  assert.strictEqual(createRes.distinct_lineages_count, 2);
  assert.strictEqual(createRes.compartmentalized_tissues.length, 2);
  console.log('✅ PASS: Created tissue chimeric agent with 2 distinct DNA lineages');

  // Test 2: Invoke tool within authorized tissue
  const invokeAllowed = await handle({
    action: 'invoke_compartmentalized_tissue',
    agent_id: agentId,
    target_tissue: 'filesystem_refactor',
    tool_name: 'ast_transform'
  });

  assert.strictEqual(invokeAllowed.success, true);
  assert.strictEqual(invokeAllowed.status, 'tissue_invocation_success');
  assert.strictEqual(invokeAllowed.active_lineage_dna, 'dna_rapid_dev_beta');
  assert.strictEqual(invokeAllowed.temperature_applied, 0.7);
  console.log('✅ PASS: Invoked ast_transform under filesystem tissue (DNA Beta)');

  // Test 3: Reject tool not expressed in targeted tissue
  const invokeDenied = await handle({
    action: 'invoke_compartmentalized_tissue',
    agent_id: agentId,
    target_tissue: 'network_io',
    tool_name: 'code_edit' // Not in network_io
  });

  assert.strictEqual(invokeDenied.success, false);
  assert.strictEqual(invokeDenied.status, 'karyotype_permission_denied');
  console.log('✅ PASS: Rejected unauthorized tool execution outside tissue lineage scope');

  // Test 4: Inspect tissue karyotype
  const inspectRes = await handle({
    action: 'inspect_tissue_karyotype',
    agent_id: agentId
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.distinct_lineages, 2);
  assert.ok(inspectRes.karyotype.network_io);
  assert.ok(inspectRes.karyotype.filesystem_refactor);
  console.log('✅ PASS: Inspected tissue karyotype and confirmed compartmentalization');

  console.log('🎉 ALL TISSUE CHIMERISM TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
