'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ ADAPTIVE (4 tests) ============
  console.log('\n=== ADAPTIVE ===');

  // 37. Positive: Staffing change approved with evidence
  try {
    const mission = {
      variant: 'adaptive',
      uncertainty: 0.8,
      requiredCapabilities: ['security'],
      staffingProposals: [{ capability: 'security', capabilityGap: true, expectedCoverageGain: 0.8, verified: true, estimatedCost: 10 }],
      availableBudget: 20,
      staffingHistory: [],
      hysteresisThreshold: 0.2,
      minStabilityPeriod: 1800000,
      maxReconfigurationsPerHour: 2
    };
    const result = await runVariantTest('adaptive', mission, { members: members, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.data.approved === true));
    console.log('✓ Adaptive: Approves verified capability gap');
    passed++;
  } catch (e) { console.log('✗ Adaptive: Valid staffing', e.message); failed++; }

  // 38. Negative: No verified capability gap
  try {
    const mission = {
      variant: 'adaptive',
      uncertainty: 0.8,
      requiredCapabilities: ['security'],
      staffingProposals: [{ capability: 'security', capabilityGap: false, expectedCoverageGain: 0.8, verified: true }],
      availableBudget: 20
    };
    await runVariantTest('adaptive', mission, { members: members, boundaries });
    console.log('✗ Adaptive: Should reject unverified gap');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAFFING_REJECTED');
    console.log('✓ Adaptive: Rejects without verified capability gap');
    passed++;
  }

  // 39. Negative: Budget exceeded
  try {
    const mission = {
      variant: 'adaptive',
      uncertainty: 0.8,
      requiredCapabilities: ['security'],
      staffingProposals: [{ capability: 'security', capabilityGap: true, expectedCoverageGain: 0.8, verified: true, estimatedCost: 100 }],
      availableBudget: 20
    };
    await runVariantTest('adaptive', mission, { members: members, boundaries });
    console.log('✗ Adaptive: Should reject over budget');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAFFING_REJECTED');
    console.log('✓ Adaptive: Enforces reconfiguration budget');
    passed++;
  }

  // 40. Negative: Rate limit exceeded
  try {
    const mission = {
      variant: 'adaptive',
      uncertainty: 0.8,
      requiredCapabilities: ['security'],
      staffingProposals: [
        { capability: 'security', capabilityGap: true, expectedCoverageGain: 0.8, verified: true },
        { capability: 'ui', capabilityGap: true, expectedCoverageGain: 0.5, verified: true },
        { capability: 'db', capabilityGap: true, expectedCoverageGain: 0.3, verified: true }
      ],
      availableBudget: 100,
      staffingHistory: [
        { at: new Date(Date.now() - 1000000).toISOString() },
        { at: new Date(Date.now() - 500000).toISOString() }
      ],
      maxReconfigurationsPerHour: 2
    };
    await runVariantTest('adaptive', mission, { members: members, boundaries });
    console.log('✗ Adaptive: Should enforce rate limit');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAFFING_REJECTED');
    console.log('✓ Adaptive: Enforces reconfiguration rate limit');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
