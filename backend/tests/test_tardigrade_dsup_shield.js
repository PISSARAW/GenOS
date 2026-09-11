/**
 * @file test_tardigrade_dsup_shield.js
 * @description Unit test for Tardigrade Dsup Shield biomimetic handler.
 */

'use strict';

const assert = require('assert');
const {
  handleDsupShield,
  deployDsupShield,
  interceptMutationAttempt,
  inspectDsupStatus,
  dsupRegistry
} = require('../src/services/mcpBioTools/handlers/tardigradeDsupShield');

function runTests() {
  console.log('=== TESTING TARDIGRADE DSUP SHIELD (MECHANICAL MUTATION SUPPRESSOR) ===');
  dsupRegistry.clear();

  // 1. Initial status when undeployed
  const initStatus = inspectDsupStatus({ target_id: 'tardigrade-agent-1' });
  assert.strictEqual(initStatus.success, true);
  assert.strictEqual(initStatus.active, false);
  console.log('✅ PASS: Initial inactive status verified');

  // 2. Deploy Dsup shield
  const deployRes = deployDsupShield({
    target_id: 'tardigrade-agent-1',
    shield_density: 0.98,
    shield_energy: 150.0,
    protected_loci: ['LOCUS_KERNEL_INTEGRITY', 'LOCUS_CORE_POLICY', 'LOCUS_PROMPT_INVARIANTS']
  });
  assert.strictEqual(deployRes.success, true);
  assert.strictEqual(deployRes.shield_density, 0.98);
  assert.strictEqual(deployRes.shield_energy, 150.0);
  assert.strictEqual(deployRes.protected_loci.length, 3);
  console.log('✅ PASS: Dsup shield deployed with electrostatic invariant coverage');

  // 3. Intercept mutation attempt on protected locus
  const interceptRes1 = interceptMutationAttempt({
    target_id: 'tardigrade-agent-1',
    target_locus: 'LOCUS_KERNEL_INTEGRITY',
    attack_vector: 'gamma_radiation_bitflip',
    mutation_intensity: 40.0
  });
  assert.strictEqual(interceptRes1.success, true);
  assert.strictEqual(interceptRes1.mutation_suppressed, true);
  assert.strictEqual(interceptRes1.residual_damage, 0);
  assert.strictEqual(interceptRes1.total_absorbed, 1);
  assert(interceptRes1.remaining_shield_energy < 150.0);
  console.log('✅ PASS: Mutation attempt fully absorbed by Dsup cloud without DNA damage');

  // 4. Mutation on unprotected locus
  const interceptRes2 = interceptMutationAttempt({
    target_id: 'tardigrade-agent-1',
    target_locus: 'LOCUS_UNPROTECTED_TRANSIENT',
    attack_vector: 'adversarial_prompt_injection',
    mutation_intensity: 30.0
  });
  assert.strictEqual(interceptRes2.success, true);
  assert.strictEqual(interceptRes2.mutation_suppressed, false);
  assert.strictEqual(interceptRes2.residual_damage, 30.0);
  console.log('✅ PASS: Unprotected locus correctly bypasses shield');

  // 5. Tool router dispatch test
  const routerRes = handleDsupShield({
    action: 'status',
    target_id: 'tardigrade-agent-1'
  });
  assert.strictEqual(routerRes.success, true);
  assert.strictEqual(routerRes.active, true);
  assert.strictEqual(routerRes.absorbed_mutations_count, 1);
  console.log('✅ PASS: handleDsupShield router dispatched correctly');

  console.log('🎉 ALL TARDIGRADE DSUP SHIELD TESTS PASSED!');
}

runTests();
