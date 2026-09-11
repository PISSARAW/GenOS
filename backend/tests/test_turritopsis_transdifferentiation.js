/**
 * @file test_turritopsis_transdifferentiation.js
 * @description Unit test for Turritopsis dohrnii immortal jellyfish transdifferentiation handler.
 */

'use strict';

const assert = require('assert');
const {
  handleTransdifferentiation,
  turritopsisRegistry
} = require('../src/services/mcpBioTools/handlers/turritopsisTransdifferentiation');

function runTests() {
  console.log('=== TESTING TURRITOPSIS DOHRNII ONTOGENIC TRANSDIFFERENTIATION ===');
  turritopsisRegistry.clear();

  // 1. Initial adult state
  const statusRes = handleTransdifferentiation({ agent_id: 'medusa_worker_1', action: 'status' });
  assert.strictEqual(statusRes.configured, true);
  assert.strictEqual(statusRes.success, true);
  assert.strictEqual(statusRes.current_stage, 'MEDUSA_ADULT');
  assert.strictEqual(statusRes.rejuvenation_cycles, 0);
  console.log('✅ PASS: Initial adult stage verified');

  // 2. Trigger transdifferentiation under critical token exhaustion
  const revertRes = handleTransdifferentiation({
    agent_id: 'medusa_worker_1',
    action: 'trigger_transdifferentiation',
    stress_trigger: 'TOKEN_EXHAUSTION_CRITICAL',
    genome_loci: ['LOCUS_CORE_IDENTITY', 'LOCUS_KERNEL_INTEGRITY', 'LOCUS_MEMORY_INVARIANTS']
  });
  assert.strictEqual(revertRes.configured, true);
  assert.strictEqual(revertRes.success, true);
  assert.strictEqual(revertRes.new_stage, 'JUVENILE_POLYP');
  assert.strictEqual(revertRes.rejuvenation_cycles, 1);
  assert.strictEqual(revertRes.preserved_genome.length, 3);
  console.log('✅ PASS: Ontogenic transdifferentiation successfully completed, stage reverted to JUVENILE_POLYP');

  // 3. Second rejuvenation cycle
  const revertRes2 = handleTransdifferentiation({
    agent_id: 'medusa_worker_1',
    action: 'trigger_transdifferentiation',
    stress_trigger: 'HAYFLICK_LIMIT_REACHED'
  });
  assert.strictEqual(revertRes2.rejuvenation_cycles, 2);
  console.log('✅ PASS: Second rejuvenation cycle recorded without state corruption');

  console.log('🎉 ALL TURRITOPSIS TRANSDIFFERENTIATION TESTS PASSED!');
}

runTests();
