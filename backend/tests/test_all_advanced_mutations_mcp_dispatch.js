/**
 * Comprehensive Integration Test:
 * Verifies that ALL 4 dynamic/non-conventional mutation biomimicry tools
 * are properly wired and executable via the central mcpToolRegistry.dispatchTool() interface.
 */

const assert = require('assert');
const { dispatchTool, isRegisteredTool, detectExecutionKind } = require('../src/services/mcpToolRegistry');

const ALL_4_ADVANCED_MUTATION_TOOLS = [
  'genos_biomimicry_transposon_jump',
  'genos_biomimicry_dynamic_triplet_expansion',
  'genos_biomimicry_mitochondrial_dna_mutation',
  'genos_biomimicry_epigenetic_methylation'
];

async function runIntegrationVerification() {
  console.log('=== VERIFYING FULL MCP WIRING FOR ALL 4 ADVANCED MUTATION TOOLS ===\n');

  let verifiedCount = 0;

  for (const toolName of ALL_4_ADVANCED_MUTATION_TOOLS) {
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

  assert.strictEqual(verifiedCount, 4);
  console.log(`\n🎉 ALL 4 ADVANCED MUTATION TOOLS ARE 100% WIRED, REGISTERED, AND OPERATIONAL VIA MCP DISPATCH!\n`);
}

runIntegrationVerification().catch(err => {
  console.error('❌ INTEGRATION VERIFICATION FAILED:', err);
  process.exit(1);
});
