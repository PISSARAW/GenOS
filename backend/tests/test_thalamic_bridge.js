const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING THALAMIC BRIDGE SENSORY SHARING ===');

  // 1. Connect two twin agents to the thalamic bridge
  const connectRes = await executeBioTool('genos_biomimicry_thalamic_bridge', {
    action: 'connect',
    bridge_id: 'bridge-twins-test',
    agent_id: 'twin-left-01',
    twin_agent_id: 'twin-right-01',
    modalities: ['embeddings', 'ast_percept', 'attention_kv']
  });

  assert.strictEqual(connectRes.success, true);
  assert.strictEqual(connectRes.status, 'connected');
  assert.strictEqual(connectRes.transport, 'thalamic_bus');
  assert.ok(connectRes.connected_agents.includes('twin-left-01'));
  assert.ok(connectRes.connected_agents.includes('twin-right-01'));
  console.log('✅ PASS: Connected twin agents to Thalamic Bridge');

  // 2. Transmit sensory frame
  const transmitRes = await executeBioTool('genos_biomimicry_thalamic_bridge', {
    action: 'transmit',
    bridge_id: 'bridge-twins-test',
    agent_id: 'twin-left-01',
    modality: 'ast_percept',
    payload: { node: 'FunctionDeclaration', name: 'parseAst', tokens: 420 }
  });

  assert.strictEqual(transmitRes.success, true);
  assert.strictEqual(transmitRes.status, 'transmitted');
  assert.ok(transmitRes.estimated_tokens_saved > 0);
  console.log(`✅ PASS: Transmitted sensory frame (tokens saved: ${transmitRes.estimated_tokens_saved})`);

  // 3. Read sensory stream from the other twin's perspective
  const readRes = await executeBioTool('genos_biomimicry_thalamic_bridge', {
    action: 'read_sensory_stream',
    bridge_id: 'bridge-twins-test',
    modality: 'ast_percept'
  });

  assert.strictEqual(readRes.success, true);
  assert.strictEqual(readRes.frame_count, 1);
  assert.strictEqual(readRes.frames[0].sender, 'twin-left-01');
  assert.strictEqual(readRes.frames[0].payload.name, 'parseAst');
  console.log('✅ PASS: Twin agent read zero-copy sensory stream without natural language re-prompting');

  // 4. Status check
  const statusRes = await executeBioTool('genos_biomimicry_thalamic_bridge', {
    action: 'status',
    bridge_id: 'bridge-twins-test'
  });
  assert.strictEqual(statusRes.success, true);
  assert.strictEqual(statusRes.total_frames_shared, 1);
  console.log('✅ PASS: Thalamic Bridge status verified');

  console.log('🎉 ALL THALAMIC BRIDGE TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
