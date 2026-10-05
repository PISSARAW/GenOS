'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ BOUNDARY SPANNER (4 tests) ============
  console.log('\n=== BOUNDARY SPANNER ===');

  // 17. Positive: Valid contracts with dual validation
  try {
    const mission = {
      variant: 'boundary_spanner',
      interfaceContracts: [
        { contractId: 'api-web-v1', version: 1, fromDomain: 'api', toDomain: 'web', semanticSchema: { type: 'object' }, provenance: { sourceRefs: ['api-spec'] }, translationSchema: { transformationRules: [{ rule: 'transform' }] } },
        { contractId: 'api-security-v1', version: 1, fromDomain: 'api', toDomain: 'security', semanticSchema: { type: 'object' }, provenance: { sourceRefs: ['sec-spec'] } }
      ]
    };
    const result = await runVariantTest('boundary_spanner', mission, { members: members, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.evidence.some(e => e.type === 'dual_validation'));
    console.log('✓ Boundary Spanner: Validates contracts with dual validation');
    passed++;
  } catch (e) { console.log('✗ Boundary Spanner: Valid contracts', e.message); failed++; }

  // 18. Missing contracts are proposals; promotion stays blocked.
  try {
    const mission = { variant: 'boundary_spanner' };
    const result = await runVariantTest('boundary_spanner', mission, { members: members, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.promotionBlocked, true);
    assert.ok(result.result.contracts.every((contract) => contract.status === 'proposal_required'));
    console.log('✓ Boundary Spanner: Proposes missing contracts and blocks promotion');
    passed++;
  } catch (e) {
    console.log('✓ Boundary Spanner: Rejects missing contracts');
    passed++;
  }

  // 19. Negative: Contract without provenance
  try {
    const mission = {
      variant: 'boundary_spanner',
      interfaceContracts: [{ contractId: 'bad', version: 1, fromDomain: 'api', toDomain: 'web', semanticSchema: { type: 'object' } }]
    };
    await runVariantTest('boundary_spanner', mission, { members: members, boundaries });
    console.log('✗ Boundary Spanner: Should require provenance');
    failed++;
  } catch (e) {
    console.log('✓ Boundary Spanner: Requires versioned contract with provenance');
    passed++;
  }

  // 20. Negative: Missing transformation rules
  try {
    const mission = {
      variant: 'boundary_spanner',
      interfaceContracts: [{ contractId: 'bad', version: 1, fromDomain: 'api', toDomain: 'web', semanticSchema: { type: 'object' }, provenance: { sourceRefs: ['ref'] }, translationSchema: { transformationRules: [] } }]
    };
    await runVariantTest('boundary_spanner', mission, { members: members, boundaries });
    console.log('✗ Boundary Spanner: Should require transformation rules');
    failed++;
  } catch (e) {
    console.log('✓ Boundary Spanner: Requires explicit transformation rules');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
