const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING EPIGENETIC METHYLATION & REVERSIBLE MEMORY ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_epigenetic_methylation', {
    action: 'status',
    id: 'epi-parent-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.sequence_intact, true);
  assert.strictEqual(initRes.tags_count, 0);
  console.log('✅ PASS: Initial unmethylated state verified');

  // 2. Environmental stress: apply silencing methylation tag on expensive GPU kernel
  const methRes = await executeBioTool('genos_biomimicry_epigenetic_methylation', {
    action: 'apply_methylation_tag',
    id: 'epi-parent-1',
    locus: 'LOCUS_EXPENSIVE_GPU_KERNEL',
    tag_type: 'silence',
    reason: 'ENVIRONMENTAL_TOKEN_FAMINE'
  });
  assert.strictEqual(methRes.success, true);
  assert.strictEqual(methRes.expression_status, 'SILENCED_DORMANT');
  assert.strictEqual(methRes.sequence_unaltered, true);
  console.log('✅ PASS: Applied silencing epigenetic mark without modifying underlying DNA');

  // 3. Inherit epigenetic marks across generations
  const inheritRes = await executeBioTool('genos_biomimicry_epigenetic_methylation', {
    action: 'inherit_epigenetic_profile',
    id: 'epi-parent-1',
    child_id: 'epi-child-1'
  });
  assert.strictEqual(inheritRes.success, true);
  assert.strictEqual(inheritRes.inherited_marks_count, 1);
  console.log('✅ PASS: Child agent inherited active transgenerational epigenetic mark');

  // 4. Environmental recovery: demethylate and restore nominal baseline
  const demethRes = await executeBioTool('genos_biomimicry_epigenetic_methylation', {
    action: 'demethylate_reversible',
    id: 'epi-parent-1',
    locus: 'LOCUS_EXPENSIVE_GPU_KERNEL'
  });
  assert.strictEqual(demethRes.success, true);
  assert.strictEqual(demethRes.expression_restored, 'NOMINAL_BASELINE');
  assert.strictEqual(demethRes.total_tags, 0);
  console.log('✅ PASS: Reversible demethylation restored nominal expression upon environmental recovery');

  console.log('🎉 ALL EPIGENETIC METHYLATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
