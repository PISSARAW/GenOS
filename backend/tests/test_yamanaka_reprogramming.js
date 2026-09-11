/**
 * @file test_yamanaka_reprogramming.js
 * @description Unit test for Yamanaka Factors (OSKM) Epigenetic Reprogramming handler.
 */

'use strict';

const assert = require('assert');
const {
  handleYamanakaReprogramming,
  yamanakaRegistry
} = require('../src/services/mcpBioTools/handlers/yamanakaReprogramming');

function runTests() {
  console.log('=== TESTING YAMANAKA FACTORS (OSKM) EPIGENETIC REPROGRAMMING ===');
  yamanakaRegistry.clear();

  // 1. Initial differentiated somatic state
  const statusRes = handleYamanakaReprogramming({
    agent_id: 'somatic_agent_dev',
    initial_role: 'LEGACY_COBOL_PARSER',
    action: 'status'
  });
  assert.strictEqual(statusRes.configured, true);
  assert.strictEqual(statusRes.success, true);
  assert.strictEqual(statusRes.current_state, 'DIFFERENTIATED_SOMATIC');
  assert.strictEqual(statusRes.active_role, 'LEGACY_COBOL_PARSER');
  assert.strictEqual(statusRes.pluripotency_score, 0.1);
  console.log('✅ PASS: Initial somatic differentiated state verified');

  // 2. Induce pluripotency via OSKM cocktail
  const iPSCRes = handleYamanakaReprogramming({
    agent_id: 'somatic_agent_dev',
    action: 'induce_pluripotency',
    factors: { oct4: true, sox2: true, klf4: true, c_myc: true }
  });
  assert.strictEqual(iPSCRes.configured, true);
  assert.strictEqual(iPSCRes.success, true);
  assert.strictEqual(iPSCRes.current_state, 'INDUCED_PLURIPOTENT_STEM_AGENT');
  assert.strictEqual(iPSCRes.pluripotency_score, 1.0);
  assert.strictEqual(iPSCRes.epigenetic_memory_cleared, true);
  console.log('✅ PASS: Pluripotency successfully induced with OSKM factors (score 1.0)');

  // 3. Re-differentiate into new specialized niche
  const diffRes = handleYamanakaReprogramming({
    agent_id: 'somatic_agent_dev',
    action: 'differentiate_into_niche',
    target_role: 'QUANTUM_ALGORITHM_SYNTHESIZER',
    niche_params: { target_domain: 'cryptography' }
  });
  assert.strictEqual(diffRes.configured, true);
  assert.strictEqual(diffRes.success, true);
  assert.strictEqual(diffRes.current_state, 'DIFFERENTIATED_SPECIALIZED');
  assert.strictEqual(diffRes.active_role, 'QUANTUM_ALGORITHM_SYNTHESIZER');
  console.log('✅ PASS: Re-differentiation into target niche role completed');

  console.log('🎉 ALL YAMANAKA REPROGRAMMING TESTS PASSED!');
}

runTests();
