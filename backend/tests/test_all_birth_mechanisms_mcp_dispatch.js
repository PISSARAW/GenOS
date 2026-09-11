/**
 * Comprehensive Integration Test:
 * Verifies that ALL 19 multiple-birth, embryology, and animal reproduction biomimicry tools
 * are properly wired and executable via the central mcpToolRegistry.dispatchTool() interface.
 */

const assert = require('assert');
const { dispatchTool, isRegisteredTool, detectExecutionKind } = require('../src/services/mcpToolRegistry');

const ALL_19_TOOLS = [
  'genos_biomimicry_thalamic_bridge',
  'genos_biomimicry_cryptophasia',
  'genos_biomimicry_mirror_twin_fork',
  'genos_biomimicry_somatic_resonance',
  'genos_biomimicry_chimeric_merge',
  'genos_biomimicry_polyovulation_spawn',
  'genos_biomimicry_monozygotic_split',
  'genos_biomimicry_hybrid_multiples',
  'genos_biomimicry_conjoined_twin_bind',
  'genos_biomimicry_parasitic_graft',
  'genos_biomimicry_fetus_in_fetu',
  'genos_biomimicry_sesquizygotic_split',
  'genos_biomimicry_heteropaternal_superfecundation',
  'genos_biomimicry_superfetation_pipeline',
  'genos_biomimicry_tissue_chimerism',
  'genos_biomimicry_obligate_polyembryony',
  'genos_biomimicry_marmoset_germline_chimerism',
  'genos_biomimicry_freemartin_endocrine_inhibition',
  'genos_biomimicry_embryonic_diapause_pipeline'
];

async function runIntegrationVerification() {
  console.log('=== VERIFYING FULL MCP WIRING FOR ALL 19 BIOMIMETIC TOOLS ===\n');

  let verifiedCount = 0;

  for (const toolName of ALL_19_TOOLS) {
    // 1. Check registration
    const isRegistered = isRegisteredTool(toolName);
    assert.strictEqual(isRegistered, true, `Tool ${toolName} must be registered in mcpToolRegistry`);

    // 2. Check execution kind detection
    const kind = detectExecutionKind(toolName);
    assert.strictEqual(kind, 'bio', `Tool ${toolName} must be classified as 'bio' kind`);

    // 3. Dispatch through central MCP registry
    const dispatchResponse = await dispatchTool(toolName, { action: 'status' });
    assert.strictEqual(dispatchResponse.kind, 'bio', `Dispatch response kind must be 'bio' for ${toolName}`);
    assert.strictEqual(dispatchResponse.result.configured, true, `Tool ${toolName} must report configured: true`);
    assert.strictEqual(dispatchResponse.result.success, true, `Tool ${toolName} must execute status successfully`);

    console.log(`✅ [MCP DISPATCH VERIFIED] -> ${toolName} (kind: ${kind}, status: OK)`);
    verifiedCount++;
  }

  assert.strictEqual(verifiedCount, 19);
  console.log(`\n🎉 ALL 19 BIOMIMETIC TOOLS ARE 100% WIRED, REGISTERED, AND OPERATIONAL VIA MCP DISPATCH!\n`);
}

runIntegrationVerification().catch(err => {
  console.error('❌ MCP Dispatch Integration Verification Failed:', err);
  process.exit(1);
});
