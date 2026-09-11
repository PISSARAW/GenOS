/**
 * Comprehensive Integration Test:
 * Verifies that ALL 8 mutation biomimicry tools (Point, Chromosomal, Genomic)
 * are properly wired and executable via the central mcpToolRegistry.dispatchTool() interface.
 */

const assert = require('assert');
const { dispatchTool, isRegisteredTool, detectExecutionKind } = require('../src/services/mcpToolRegistry');

const ALL_8_MUTATION_TOOLS = [
  'genos_biomimicry_point_mutation',
  'genos_biomimicry_frameshift_mutation',
  'genos_biomimicry_chromosomal_deletion',
  'genos_biomimicry_chromosomal_duplication',
  'genos_biomimicry_chromosomal_inversion',
  'genos_biomimicry_chromosomal_translocation',
  'genos_biomimicry_aneuploidy',
  'genos_biomimicry_polyploidy'
];

async function runIntegrationVerification() {
  console.log('=== VERIFYING FULL MCP WIRING FOR ALL 8 MUTATION BIOMIMETIC TOOLS ===\n');

  let verifiedCount = 0;

  for (const toolName of ALL_8_MUTATION_TOOLS) {
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

  assert.strictEqual(verifiedCount, 8);
  console.log(`\n🎉 ALL 8 MUTATION BIOMIMETIC TOOLS ARE 100% WIRED, REGISTERED, AND OPERATIONAL VIA MCP DISPATCH!\n`);
}

runIntegrationVerification().catch(err => {
  console.error('❌ INTEGRATION VERIFICATION FAILED:', err);
  process.exit(1);
});
