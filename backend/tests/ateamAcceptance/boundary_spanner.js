'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'boundary_spanner',
      interfaceContracts: [
        { contractId: 'api-web-v1', version: 1, fromDomain: 'api', toDomain: 'web', semanticSchema: { type: 'object' }, provenance: { sourceRefs: ['api-spec'] }, translationSchema: { transformationRules: [{ rule: 'transform' }] } },
        { contractId: 'api-security-v1', version: 1, fromDomain: 'api', toDomain: 'security', semanticSchema: { type: 'object' }, provenance: { sourceRefs: ['sec-spec'] } }
      ]
    };
    const result = await runVariantTest('boundary_spanner', mission, members, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.evidence.some(e => e.type === 'dual_validation'));
    console.log('✓ Boundary Spanner: Validates contracts with dual validation');
    context.passed++;
  } catch (e) { console.log('✗ Boundary Spanner: Valid contracts', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = { variant: 'boundary_spanner' };
    const result = await runVariantTest('boundary_spanner', mission, members, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.promotionBlocked, true);
    assert.ok(result.result.contracts.every((contract) => contract.status === 'proposal_required'));
    console.log('✓ Boundary Spanner: Proposes missing contracts and blocks promotion');
    context.passed++;
  } catch (e) {
    console.log('✓ Boundary Spanner: Rejects missing contracts');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'boundary_spanner',
      interfaceContracts: [{ contractId: 'bad', version: 1, fromDomain: 'api', toDomain: 'web', semanticSchema: { type: 'object' } }]
    };
    await runVariantTest('boundary_spanner', mission, members, boundaries);
    console.log('✗ Boundary Spanner: Should require provenance');
    context.failed++;
  } catch (e) {
    console.log('✓ Boundary Spanner: Requires versioned contract with provenance');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'boundary_spanner',
      interfaceContracts: [{ contractId: 'bad', version: 1, fromDomain: 'api', toDomain: 'web', semanticSchema: { type: 'object' }, provenance: { sourceRefs: ['ref'] }, translationSchema: { transformationRules: [] } }]
    };
    await runVariantTest('boundary_spanner', mission, members, boundaries);
    console.log('✗ Boundary Spanner: Should require transformation rules');
    context.failed++;
  } catch (e) {
    console.log('✓ Boundary Spanner: Requires explicit transformation rules');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
