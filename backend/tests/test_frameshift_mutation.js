const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING FRAMESHIFT (INDEL) MUTATION ===');

  // 1. Check initial status
  const initRes = await executeBioTool('genos_biomimicry_frameshift_mutation', {
    action: 'status',
    id: 'mut-shift-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.frame_shift_offset, 0);
  assert.strictEqual(initRes.is_synchronized, true);
  console.log('✅ PASS: Initial reading frame is synchronized (offset 0)');

  // 2. Insert token to cause a +1 frameshift desynchronization
  const insertRes = await executeBioTool('genos_biomimicry_frameshift_mutation', {
    action: 'insert_token_frameshift',
    id: 'mut-shift-test-1',
    token: 'NOISE_INSERTION',
    position: 1
  });
  assert.strictEqual(insertRes.success, true);
  assert.strictEqual(insertRes.frame_shift_offset, 1);
  assert.strictEqual(insertRes.is_synchronized, false);
  console.log('✅ PASS: Single insertion caused +1 frameshift desynchronization');

  // 3. Delete token to cause a -1 (offset 0 mod 3) restoration
  const deleteRes = await executeBioTool('genos_biomimicry_frameshift_mutation', {
    action: 'delete_token_frameshift',
    id: 'mut-shift-test-1',
    position: 1
  });
  assert.strictEqual(deleteRes.success, true);
  assert.strictEqual(deleteRes.frame_shift_offset, 0);
  assert.strictEqual(deleteRes.is_synchronized, true);
  console.log('✅ PASS: Single deletion counteracted shift back to offset 0');

  // 4. Cause another insertion and realign via compensatory pads
  await executeBioTool('genos_biomimicry_frameshift_mutation', {
    action: 'insert_token_frameshift',
    id: 'mut-shift-test-1',
    token: 'ASYNC_PROMPT_STEP',
    position: 0
  });

  const realignRes = await executeBioTool('genos_biomimicry_frameshift_mutation', {
    action: 'realign_reading_frame',
    id: 'mut-shift-test-1'
  });
  assert.strictEqual(realignRes.success, true);
  assert.strictEqual(realignRes.is_synchronized, true);
  assert.strictEqual(realignRes.pads_inserted, 2);
  console.log('✅ PASS: Compensatory pads restored triplet synchronization');

  console.log('🎉 ALL FRAMESHIFT MUTATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
