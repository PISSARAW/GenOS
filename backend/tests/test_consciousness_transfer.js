/**
 * @file test_consciousness_transfer.js
 * @description Unit test for Temporal Consciousness Transfer handler (Groundhog Day / Edge of Tomorrow Replay).
 */

'use strict';

const assert = require('assert');
const {
  handleConsciousnessTransfer,
  consciousnessRegistry
} = require('../src/services/mcpBioTools/handlers/consciousnessTransfer');

function runTests() {
  console.log('=== TESTING TEMPORAL CONSCIOUSNESS TRANSFER (GROUNDHOG REPLAY) ===');
  consciousnessRegistry.clear();

  // 1. Initial baseline status
  const initStatus = handleConsciousnessTransfer({
    agent_id: 'time_loop_worker',
    baseline_snapshot_id: 'snap-git-commit-initial',
    action: 'status'
  });
  assert.strictEqual(initStatus.configured, true);
  assert.strictEqual(initStatus.success, true);
  assert.strictEqual(initStatus.current_iteration, 1);
  assert.strictEqual(initStatus.cumulative_memories_count, 0);
  console.log('✅ PASS: Initial timeline iteration #1 verified');

  // 2. Execute transfer to baseline with future failure lessons
  const transferRes = handleConsciousnessTransfer({
    agent_id: 'time_loop_worker',
    action: 'execute_transfer',
    baseline_snapshot_id: 'snap-git-commit-initial',
    future_memories: [
      { failure: 'DEADLOCK_AT_MUTEX_0x42', resolution: 'ACQUIRE_LOCK_IN_LEXICOGRAPHIC_ORDER' },
      { failure: 'BUFFER_OVERFLOW_CHUNK_9', resolution: 'BOUND_BUFFER_TO_4096_BYTES' }
    ]
  });
  assert.strictEqual(transferRes.configured, true);
  assert.strictEqual(transferRes.success, true);
  assert.strictEqual(transferRes.new_iteration, 2);
  assert.strictEqual(transferRes.total_preserved_memories, 2);
  assert.strictEqual(transferRes.restored_baseline, 'snap-git-commit-initial');
  console.log('✅ PASS: Replay executed at t0 with 2 forward memories preserved');

  // 3. Second death / retry loop with additional memories
  const transferRes2 = handleConsciousnessTransfer({
    agent_id: 'time_loop_worker',
    action: 'execute_transfer',
    future_memories: [
      { failure: 'TIMEOUT_ON_DOWNSTREAM_RPC', resolution: 'ENABLE_CIRCUIT_BREAKER_WITH_JITTER' }
    ]
  });
  assert.strictEqual(transferRes2.new_iteration, 3);
  assert.strictEqual(transferRes2.total_preserved_memories, 3);
  console.log('✅ PASS: Iteration #3 successfully accumulated cumulative memories');

  console.log('🎉 ALL CONSCIOUSNESS TRANSFER TESTS PASSED!');
}

runTests();
