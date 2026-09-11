/**
 * @file test_all_replay_and_reversion_mcp_dispatch.js
 * @description Comprehensive integration test verifying all 4 Replay & Biological Reversion
 * primitives dispatched through the official GenOS dispatchTool interface.
 */

'use strict';

const assert = require('assert');
const { dispatchTool, isRegisteredTool, detectExecutionKind } = require('../src/services/mcpToolRegistry');

const ALL_4_REPLAY_TOOLS = [
  'genos_biomimicry_turritopsis_transdifferentiation',
  'genos_biomimicry_yamanaka_reprogramming',
  'genos_temporal_consciousness_transfer',
  'genos_temporal_novikov_causal_rebase'
];

async function runAllReplayAndReversionMcpTests() {
  console.log('=== VERIFYING FULL MCP WIRING FOR ALL 4 REPLAY & BIOLOGICAL REVERSION TOOLS ===\n');

  let verifiedCount = 0;

  for (const toolName of ALL_4_REPLAY_TOOLS) {
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

  // 1. Turritopsis dohrnii Transdifferentiation
  const turritopsisRes = await dispatchTool('genos_biomimicry_turritopsis_transdifferentiation', {
    action: 'trigger_transdifferentiation',
    agent_id: 'mcp_medusa_agent',
    stress_trigger: 'TOKEN_LIMIT_DEPLETED'
  });
  assert.strictEqual(turritopsisRes.result.success, true);
  assert.strictEqual(turritopsisRes.result.new_stage, 'JUVENILE_POLYP');
  console.log('✅ Deep Verified: Turritopsis dohrnii Transdifferentiation');

  // 2. Yamanaka Epigenetic Reprogramming
  const yamanakaRes = await dispatchTool('genos_biomimicry_yamanaka_reprogramming', {
    action: 'induce_pluripotency',
    agent_id: 'mcp_somatic_agent'
  });
  assert.strictEqual(yamanakaRes.result.success, true);
  assert.strictEqual(yamanakaRes.result.pluripotency_score, 1.0);
  console.log('✅ Deep Verified: Yamanaka OSKM Epigenetic Reprogramming');

  // 3. Temporal Consciousness Transfer
  const consciousnessRes = await dispatchTool('genos_temporal_consciousness_transfer', {
    action: 'execute_transfer',
    agent_id: 'mcp_time_traveler',
    baseline_snapshot_id: 'snap-git-baseline',
    future_memories: [{ failure: 'TIMEOUT_DB', fix: 'ADD_INDEX' }]
  });
  assert.strictEqual(consciousnessRes.result.success, true);
  assert.strictEqual(consciousnessRes.result.new_iteration, 2);
  console.log('✅ Deep Verified: Temporal Consciousness Transfer Replay');

  // 4. Novikov Causal Rebase
  const novikovRes = await dispatchTool('genos_temporal_novikov_causal_rebase', {
    action: 'rebase_causal_timeline',
    timeline_id: 'mcp-prod-timeline',
    intervention: { target_step: 3, patch: 'HOTFIX_ZERO_COPY' }
  });
  assert.strictEqual(novikovRes.result.success, true);
  assert.strictEqual(novikovRes.result.self_consistent, true);
  console.log('✅ Deep Verified: Novikov Self-Consistent Causal Rebase');

  console.log('\n🎉 ALL 4 REPLAY & REVERSION BIOMIMETIC TOOLS ARE 100% OPERATIONAL VIA MCP DISPATCH!\n');
}

runAllReplayAndReversionMcpTests().catch((err) => {
  console.error('❌ MCP Dispatch Test Failed:', err);
  process.exit(1);
});
