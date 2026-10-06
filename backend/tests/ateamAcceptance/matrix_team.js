'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd', vetoRights: { functional: true, product: true } }],
      decisions: [{ decisionId: 'd1', type: 'release', revision: 0, functionalApproval: true, functionalApproverId: 'fn', productApproval: true, productApproverId: 'pd' }]
    };
    const result = await runVariantTest('matrix_team', mission, members, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.data.status === 'APPROVED'));
    console.log('✓ Matrix Team: Accepts dual owner approval');
    context.passed++;
  } catch (e) { console.log('✗ Matrix Team: Dual approval', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' }],
      decisions: [{ decisionId: 'd1', type: 'release', revision: 1, functionalApproval: true, functionalApproverId: 'fn' }]
    };
    await runVariantTest('matrix_team', mission, members, boundaries);
    console.log('✗ Matrix Team: Should reject stale revision');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MATRIX_REVISION_CONFLICT');
    console.log('✓ Matrix Team: Rejects stale revision');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' }],
      decisions: [{ decisionId: 'd1', type: 'release', revision: 0, functionalApproval: true, functionalApproverId: 'wrong', productApproval: true, productApproverId: 'pd' }]
    };
    await runVariantTest('matrix_team', mission, members, boundaries);
    console.log('✗ Matrix Team: Should reject wrong owner');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MATRIX_OWNER_MISMATCH');
    console.log('✓ Matrix Team: Rejects approval from wrong owner');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'matrix_team',
      decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' }],
      decisions: [{ decisionId: 'd1', type: 'deploy', revision: 1, functionalApproval: true, functionalApproverId: 'fn', productApproval: true, productApproverId: 'pd' }]
    };
    await runVariantTest('matrix_team', mission, members, boundaries);
    console.log('✗ Matrix Team: Should reject unknown decision type');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MATRIX_AUTHORITY_MISSING');
    console.log('✓ Matrix Team: Rejects decision without authority');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
