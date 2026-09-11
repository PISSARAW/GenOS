/**
 * @file test_all_living_world_mechanisms_mcp_dispatch.js
 * @description Comprehensive test dispatching all 4 Living World genetic alteration & defense
 * mechanisms through the official GenOS dispatchTool interface.
 */

'use strict';

const assert = require('assert');
const { dispatchTool, isRegisteredTool, detectExecutionKind } = require('../src/services/mcpToolRegistry');

const ALL_4_LIVING_WORLD_TOOLS = [
  'genos_biomimicry_horizontal_gene_transfer',
  'genos_biomimicry_agrobacterium_tdna_hijack',
  'genos_biomimicry_viral_endogenization',
  'genos_biomimicry_tardigrade_dsup_shield'
];

async function runAllLivingWorldMcpTests() {
  console.log('=== VERIFYING FULL MCP WIRING FOR ALL 4 LIVING WORLD GENETIC & DEFENSE TOOLS ===\n');

  let verifiedCount = 0;

  for (const toolName of ALL_4_LIVING_WORLD_TOOLS) {
    const isRegistered = isRegisteredTool(toolName);
    assert.strictEqual(isRegistered, true, `Tool ${toolName} must be registered in mcpToolRegistry`);

    const kind = detectExecutionKind(toolName);
    assert.strictEqual(kind, 'bio', `Tool ${toolName} must be classified as 'bio' kind`);

    const dispatchResponse = await dispatchTool(toolName, { action: 'status' });
    assert.strictEqual(dispatchResponse.kind, 'bio', `Dispatch response kind must be 'bio' for ${toolName}`);
    assert.strictEqual(dispatchResponse.result.configured, true, `Tool ${toolName} must report configured: true`);
    assert.strictEqual(dispatchResponse.result.success, true, `Tool ${toolName} must execute status successfully`);

    console.log(`✅ [MCP DISPATCH VERIFIED] -> ${toolName} (kind: ${kind}, status: OK)`);
    verifiedCount++;
  }

  assert.strictEqual(verifiedCount, 4);

  // Deep operational verification for each tool
  console.log('\n--- Deep Operational Dispatch Verification ---');

  // 1. Horizontal Gene Transfer
  const hgtRes = await dispatchTool('genos_biomimicry_horizontal_gene_transfer', {
    action: 'conjugate_bacterial_plasmid',
    source_agent_id: 'ecoli_donor_1',
    target_agent_id: 'pseudomonas_recip_1',
    plasmid_name: 'pTEST_RESISTANCE'
  });
  assert.strictEqual(hgtRes.result.success, true);
  assert.strictEqual(hgtRes.result.status, 'plasmid_conjugated');
  console.log('✅ Deep Verified: Horizontal Gene Transfer');

  // 2. Agrobacterium T-DNA Hijack
  const agroRes = await dispatchTool('genos_biomimicry_agrobacterium_tdna_hijack', {
    action: 'inject_tdna_payload',
    host_id: 'plant_host_1',
    tdna_payload: 'T_DNA_COMPUTE_GALL',
    allocated_tokens: 1000
  });
  assert.strictEqual(agroRes.result.success, true);
  assert.strictEqual(agroRes.result.status, 'tdna_injected_successfully');
  console.log('✅ Deep Verified: Agrobacterium T-DNA Hijack');

  // 3. Viral Germline Endogenization
  const ervRes = await dispatchTool('genos_biomimicry_viral_endogenization', {
    action: 'integrate_exogenous_retrovirus',
    id: 'parent_agent_koala',
    virus_name: 'KoRV_BETA_RETROVIRUS',
    endogenized_role: 'NATIVE_DEFENSE_PROMOTER'
  });
  assert.strictEqual(ervRes.result.success, true);
  assert.strictEqual(ervRes.result.germline_integrated, true);
  console.log('✅ Deep Verified: Viral Germline Endogenization');

  // 4. Tardigrade Dsup Invariant Shield
  const dsupDeployRes = await dispatchTool('genos_biomimicry_tardigrade_dsup_shield', {
    action: 'deploy_dsup_shield',
    target_id: 'agent_dsup_target',
    shield_density: 0.95,
    shield_energy: 100.0,
    protected_loci: ['LOCUS_KERNEL_INTEGRITY']
  });
  assert.strictEqual(dsupDeployRes.result.success, true);

  const dsupInterceptRes = await dispatchTool('genos_biomimicry_tardigrade_dsup_shield', {
    action: 'intercept_mutation_attempt',
    target_id: 'agent_dsup_target',
    target_locus: 'LOCUS_KERNEL_INTEGRITY',
    mutation_intensity: 30.0
  });
  assert.strictEqual(dsupInterceptRes.result.success, true);
  assert.strictEqual(dsupInterceptRes.result.mutation_suppressed, true);
  console.log('✅ Deep Verified: Tardigrade Dsup Invariant Shield');

  console.log('\n🎉 ALL 4 LIVING WORLD BIOMIMETIC TOOLS ARE 100% OPERATIONAL VIA MCP DISPATCH!\n');
}

runAllLivingWorldMcpTests().catch((err) => {
  console.error('❌ MCP Dispatch Test Failed:', err);
  process.exit(1);
});
