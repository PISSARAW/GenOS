'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ MATRIX TEAM (4 tests) ============
  console.log('\n=== MATRIX TEAM ===');

  // 21. Positive: Dual owner approval
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd', vetoRights: { functional: true, product: true } }],
      decisions: [{ decisionId: 'd1', type: 'release', revision: 0, functionalApproval: true, functionalApproverId: 'fn', productApproval: true, productApproverId: 'pd' }]
    };
    const result = await runVariantTest('matrix_team', mission, { members: members, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.data.status === 'APPROVED'));
    console.log('✓ Matrix Team: Accepts dual owner approval');
    passed++;
  } catch (e) { console.log('✗ Matrix Team: Dual approval', e.message); failed++; }

  // 22. Negative: Stale revision rejected
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' }],
      decisions: [{ decisionId: 'd1', type: 'release', revision: 1, functionalApproval: true, functionalApproverId: 'fn' }]
    };
    await runVariantTest('matrix_team', mission, { members: members, boundaries });
    console.log('✗ Matrix Team: Should reject stale revision');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MATRIX_REVISION_CONFLICT');
    console.log('✓ Matrix Team: Rejects stale revision');
    passed++;
  }

  // 23. Negative: Wrong owner approval
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' }],
      decisions: [{ decisionId: 'd1', type: 'release', revision: 0, functionalApproval: true, functionalApproverId: 'wrong', productApproval: true, productApproverId: 'pd' }]
    };
    await runVariantTest('matrix_team', mission, { members: members, boundaries });
    console.log('✗ Matrix Team: Should reject wrong owner');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MATRIX_OWNER_MISMATCH');
    console.log('✓ Matrix Team: Rejects approval from wrong owner');
    passed++;
  }

  // 24. Negative: Missing authority for decision type
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' }],
      decisions: [{ decisionId: 'd1', type: 'deploy', revision: 1, functionalApproval: true, functionalApproverId: 'fn', productApproval: true, productApproverId: 'pd' }]
    };
    await runVariantTest('matrix_team', mission, { members: members, boundaries });
    console.log('✗ Matrix Team: Should reject unknown decision type');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MATRIX_AUTHORITY_MISSING');
    console.log('✓ Matrix Team: Rejects decision without authority');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
