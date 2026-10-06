'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', ownedResponsibilities: ['api-design'], capabilities: ['api'] },
      { memberId: 'web', domain: 'web', ownedResponsibilities: ['web-ui'], capabilities: ['web'] },
      { memberId: 'db', domain: 'db', ownedResponsibilities: ['data-model'], capabilities: ['database'] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 2 };
    const result = await runVariantTest('cross_functional_pod', mission, podMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.owners.length, 3);
    console.log('✓ Cross-Functional Pod: Valid unique ownership');
    context.passed++;
  } catch (e) { console.log('✗ Cross-Functional Pod: Valid ownership', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', ownedResponsibilities: ['shared'], capabilities: ['api'] },
      { memberId: 'web', domain: 'web', ownedResponsibilities: ['shared'], capabilities: ['web'] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 2 };
    await runVariantTest('cross_functional_pod', mission, podMembers, boundaries);
    console.log('✗ Cross-Functional Pod: Should reject duplicate ownership');
    context.failed++;
  } catch (e) {
    console.log('✓ Cross-Functional Pod: Rejects duplicate artifact ownership');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', capabilities: ['api'], externalDependencies: ['ext1', 'ext2', 'ext3'] },
      { memberId: 'web', domain: 'web', capabilities: ['web'], externalDependencies: ['ext4'] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 2 };
    await runVariantTest('cross_functional_pod', mission, podMembers, boundaries);
    console.log('✗ Cross-Functional Pod: Should reject too many external deps');
    context.failed++;
  } catch (e) {
    console.log('✓ Cross-Functional Pod: Enforces external dependency limit');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const podMembers = createMockMembers([
      { memberId: 'api', domain: 'api', ownedResponsibilities: ['api'], capabilities: ['api'], externalDependencies: [] },
      { memberId: 'web', domain: 'web', ownedResponsibilities: ['web'], capabilities: ['web'], externalDependencies: [] },
      { memberId: 'db', domain: 'db', ownedResponsibilities: ['db'], capabilities: ['db'], externalDependencies: [] }
    ]);
    const mission = { variant: 'cross_functional_pod', externalDependencyLimit: 5 };
    const result = await runVariantTest('cross_functional_pod', mission, podMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.result.autonomyScore === 1);
    console.log('✓ Cross-Functional Pod: Tracks autonomy metric');
    context.passed++;
  } catch (e) { console.log('✗ Cross-Functional Pod: Autonomy metric', e.message); context.failed++; }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
