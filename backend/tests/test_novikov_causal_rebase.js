/**
 * @file test_novikov_causal_rebase.js
 * @description Unit test for Novikov Self-Consistency and Causal Timeline Rebase handler.
 */

'use strict';

const assert = require('assert');
const {
  handleNovikovCausalRebase,
  timelineRegistry
} = require('../src/services/mcpBioTools/handlers/novikovCausalRebase');

function runTests() {
  console.log('=== TESTING NOVIKOV CAUSAL REBASE (SELF-CONSISTENT REPLAY) ===');
  timelineRegistry.clear();

  // 1. Initial status
  const initStatus = handleNovikovCausalRebase({ timeline_id: 'prod-timeline-alpha', action: 'status' });
  assert.strictEqual(initStatus.configured, true);
  assert.strictEqual(initStatus.success, true);
  assert.strictEqual(initStatus.rebase_count, 0);
  console.log('✅ PASS: Initial timeline state verified');

  // 2. Reject intervention violating Novikov self-consistency (Grandfather paradox)
  const rejectRes = handleNovikovCausalRebase({
    timeline_id: 'prod-timeline-alpha',
    action: 'rebase_causal_timeline',
    intervention: { target_step: 0, alters_root_ancestry: true }
  });
  assert.strictEqual(rejectRes.configured, true);
  assert.strictEqual(rejectRes.success, false);
  assert.strictEqual(rejectRes.status, 'rebase_rejected_paradox');
  assert.strictEqual(rejectRes.paradox_type, 'GRANDFATHER_PARADOX_ROOT_DESTRUCTION');
  console.log('✅ PASS: Grandfather paradox intervention correctly rejected');

  // 3. Valid consistent causal rebase
  const validRebaseRes = handleNovikovCausalRebase({
    timeline_id: 'prod-timeline-alpha',
    action: 'rebase_causal_timeline',
    intervention: { target_step: 4, patch_code: 'FIX_RACE_CONDITION' },
    downstream_steps: ['STEP_4_PARSER_REBUILD', 'STEP_5_INTEGRATION_TEST', 'STEP_6_DEPLOY']
  });
  assert.strictEqual(validRebaseRes.configured, true);
  assert.strictEqual(validRebaseRes.success, true);
  assert.strictEqual(validRebaseRes.self_consistent, true);
  assert.strictEqual(validRebaseRes.rebase_count, 1);
  assert.strictEqual(validRebaseRes.steps_recalculated.length, 3);
  console.log('✅ PASS: Causal rebase successfully propagated downstream deltas with P(paradox) = 0');

  console.log('🎉 ALL NOVIKOV CAUSAL REBASE TESTS PASSED!');
}

runTests();
