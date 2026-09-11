const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING SOMATIC RESONANCE & STRESS TELEMETRY ===');

  // 1. Subscribe three collective peers to the somatic mesh
  const subRes = await executeBioTool('genos_biomimicry_somatic_resonance', {
    action: 'subscribe_resonance',
    mesh_id: 'mesh-twin-cluster',
    peers: ['twin-alpha', 'twin-beta', 'twin-gamma']
  });

  assert.strictEqual(subRes.success, true);
  assert.strictEqual(subRes.status, 'subscribed');
  assert.strictEqual(subRes.subscribers.length, 3);
  console.log(`✅ PASS: Subscribed ${subRes.subscribers.length} peer agents to somatic mesh`);

  // 2. Emit an extreme cognitive stress / entropy pulse from twin-alpha
  const pulseRes = await executeBioTool('genos_biomimicry_somatic_resonance', {
    action: 'emit_somatic_pulse',
    mesh_id: 'mesh-twin-cluster',
    agent_id: 'twin-alpha',
    entropy: 0.92,
    stress_level: 'critical_panic',
    reason: 'Cyclic recursive loop detected in AST parsing'
  });

  assert.strictEqual(pulseRes.success, true);
  assert.strictEqual(pulseRes.status, 'somatic_pulse_propagated');
  assert.strictEqual(pulseRes.autonomic_reflex_triggered, 'TRIGGER_COORDINATED_CRYPTOBIOSIS_FREEZE');
  console.log(`✅ PASS: Propagated somatic entropy pulse (Autonomic Reflex: ${pulseRes.autonomic_reflex_triggered})`);

  // 3. Evaluate the collective somatic state of the mesh
  const evalRes = await executeBioTool('genos_biomimicry_somatic_resonance', {
    action: 'evaluate_somatic_state',
    mesh_id: 'mesh-twin-cluster'
  });

  assert.strictEqual(evalRes.success, true);
  assert.strictEqual(evalRes.status, 'evaluated');
  assert.strictEqual(evalRes.resonance_state, 'hyper_synchronous_panic_lock');
  console.log(`✅ PASS: Mesh in coordinated resonance state: ${evalRes.resonance_state}`);

  console.log('🎉 ALL SOMATIC RESONANCE TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
