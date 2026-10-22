/**
 * Integration test for MCP registration and status dispatch of 19 biomimicry tools.
 * Status dispatch does not prove that these tools create executable runtime agents.
 */

const assert = require('assert');
const { dispatchTool, isRegisteredTool, detectExecutionKind } = require('../src/services/mcpToolRegistry');
const { probeBioFeature } = require('../src/services/mcpBioTools/featureProbe');

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

function statusArguments(toolName) {
  const identifiers = {
    genos_biomimicry_thalamic_bridge: { bridge_id: 'mcp-status-bridge' },
    genos_biomimicry_conjoined_twin_bind: { pair_id: 'mcp-status-pair' },
    genos_biomimicry_mirror_twin_fork: { pair_id: 'mcp-status-pair' },
    genos_biomimicry_parasitic_graft: { host_id: 'mcp-status-host' }
  };
  return { action: 'status', ...(identifiers[toolName] || {}) };
}

function verifyProbeFailureBoundary() {
  const unsupported = () => { throw new Error("Unknown biomimicry feature 'fixture'."); };
  const denied = () => { throw new Error('permission denied'); };
  assert.strictEqual(probeBioFeature(unsupported, 'genos biomimicry bio-feature --feature fixture --action status').cliFailed, false);
  assert.strictEqual(probeBioFeature(unsupported, 'genos biomimicry bio-feature --feature fixture --action fuse').cliFailed, true);
  assert.strictEqual(probeBioFeature(denied, 'genos biomimicry bio-feature --feature fixture --action status').cliFailed, true);
}

async function runIntegrationVerification() {
  const previousLease = process.env.GENOS_MCP_LEASE;
  const previousLeaseExpiry = process.env.GENOS_MCP_LEASE_EXPIRES_AT;
  process.env.GENOS_MCP_LEASE = ALL_19_TOOLS.join(',');
  process.env.GENOS_MCP_LEASE_EXPIRES_AT = String(Date.now() + 60_000);
  try {
    verifyProbeFailureBoundary();
    console.log('=== VERIFYING MCP REGISTRATION AND STATUS DISPATCH FOR 19 TOOLS ===\n');
    let verifiedCount = 0;

    for (const toolName of ALL_19_TOOLS) {
      assert.strictEqual(isRegisteredTool(toolName), true, `Tool ${toolName} must be registered in mcpToolRegistry`);
      const kind = detectExecutionKind(toolName);
      assert.strictEqual(kind, 'bio', `Tool ${toolName} must be classified as 'bio' kind`);
      const dispatchResponse = await dispatchTool(toolName, statusArguments(toolName));
      assert.strictEqual(dispatchResponse.kind, 'bio', `Dispatch response kind must be 'bio' for ${toolName}`);
      assert.strictEqual(dispatchResponse.result.configured, true, `Tool ${toolName} must report configured: true`);
      assert.strictEqual(dispatchResponse.result.success, true, `Tool ${toolName} must return a successful status for ${toolName}`);
      console.log(`✅ [MCP STATUS VERIFIED] -> ${toolName} (kind: ${kind}, status: OK)`);
      verifiedCount++;
    }

    assert.strictEqual(verifiedCount, 19);
    console.log('\nAll 19 MCP status dispatches returned success; runtime birth was not tested.\n');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
    if (previousLeaseExpiry === undefined) delete process.env.GENOS_MCP_LEASE_EXPIRES_AT;
    else process.env.GENOS_MCP_LEASE_EXPIRES_AT = previousLeaseExpiry;
  }
}

runIntegrationVerification().catch(err => {
  console.error('❌ MCP Dispatch Integration Verification Failed:', err);
  process.exit(1);
});
