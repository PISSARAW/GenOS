'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
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
    const result = await runVariantTest('adaptive', mission, members, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.data.approved === true));
    console.log('✓ Adaptive: Approves verified capability gap');
    context.passed++;
  } catch (e) { console.log('✗ Adaptive: Valid staffing', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'adaptive',
      uncertainty: 0.8,
      requiredCapabilities: ['security'],
      staffingProposals: [{ capability: 'security', capabilityGap: false, expectedCoverageGain: 0.8, verified: true }],
      availableBudget: 20
    };
    await runVariantTest('adaptive', mission, members, boundaries);
    console.log('✗ Adaptive: Should reject unverified gap');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAFFING_REJECTED');
    console.log('✓ Adaptive: Rejects without verified capability gap');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'adaptive',
      uncertainty: 0.8,
      requiredCapabilities: ['security'],
      staffingProposals: [{ capability: 'security', capabilityGap: true, expectedCoverageGain: 0.8, verified: true, estimatedCost: 100 }],
      availableBudget: 20
    };
    await runVariantTest('adaptive', mission, members, boundaries);
    console.log('✗ Adaptive: Should reject over budget');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAFFING_REJECTED');
    console.log('✓ Adaptive: Enforces reconfiguration budget');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
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
    await runVariantTest('adaptive', mission, members, boundaries);
    console.log('✗ Adaptive: Should enforce rate limit');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAFFING_REJECTED');
    console.log('✓ Adaptive: Enforces reconfiguration rate limit');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
