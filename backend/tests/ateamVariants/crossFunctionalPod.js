'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ CROSS-FUNCTIONAL POD (4 tests) ============
  console.log('\n=== CROSS-FUNCTIONAL POD ===');

  // 13. Positive: Valid pod with unique ownership
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', ownedResponsibilities: ['api-design'], capabilities: ['api'] },
      { memberId: 'web', domain: 'web', ownedResponsibilities: ['web-ui'], capabilities: ['web'] },
      { memberId: 'db', domain: 'db', ownedResponsibilities: ['data-model'], capabilities: ['database'] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 2 };
    const result = await runVariantTest('cross_functional_pod', mission, { members: podMembers, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.owners.length, 3);
    console.log('✓ Cross-Functional Pod: Valid unique ownership');
    passed++;
  } catch (e) { console.log('✗ Cross-Functional Pod: Valid ownership', e.message); failed++; }

  // 14. Negative: Duplicate ownership
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', ownedResponsibilities: ['shared'], capabilities: ['api'] },
      { memberId: 'web', domain: 'web', ownedResponsibilities: ['shared'], capabilities: ['web'] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 2 };
    await runVariantTest('cross_functional_pod', mission, { members: podMembers, boundaries });
    console.log('✗ Cross-Functional Pod: Should reject duplicate ownership');
    failed++;
  } catch (e) {
    console.log('✓ Cross-Functional Pod: Rejects duplicate artifact ownership');
    passed++;
  }

  // 15. Negative: External dependency limit exceeded
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', capabilities: ['api'], externalDependencies: ['ext1', 'ext2', 'ext3'] },
      { memberId: 'web', domain: 'web', capabilities: ['web'], externalDependencies: ['ext4'] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 2 };
    await runVariantTest('cross_functional_pod', mission, { members: podMembers, boundaries });
    console.log('✗ Cross-Functional Pod: Should reject too many external deps');
    failed++;
  } catch (e) {
    console.log('✓ Cross-Functional Pod: Enforces external dependency limit');
    passed++;
  }

  // 16. Positive: Autonomy metric tracked
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', ownedResponsibilities: ['api'], capabilities: ['api'], externalDependencies: [] },
      { memberId: 'web', domain: 'web', ownedResponsibilities: ['web'], capabilities: ['web'], externalDependencies: [] },
      { memberId: 'db', domain: 'db', ownedResponsibilities: ['db'], capabilities: ['db'], externalDependencies: [] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 5 };
    const result = await runVariantTest('cross_functional_pod', mission, { members: podMembers, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.result.autonomyScore === 1);
    console.log('✓ Cross-Functional Pod: Tracks autonomy metric');
    passed++;
  } catch (e) { console.log('✗ Cross-Functional Pod: Autonomy metric', e.message); failed++; }

  return { passed, failed };
}

module.exports = run;
