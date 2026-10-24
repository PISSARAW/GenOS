'use strict';

const assert = require('node:assert/strict');
const { verifyCampaignSourceEvidence } = require('../src/services/socialWorldSourceEvidence');

function passingState() {
  return { report: { status: 'pass', config: { organizationId: 'org', projectId: 'project' },
    sharedFactors: { permissionHash: 'policy' }, arms: { 'genos-full': { status: 'pass', evidenceRefs: [] } } },
    errors: [], artifacts: new Map(), sourceReceiptIds: new Set() };
}

function testMissingSourceAndAuthorityFailsClosed() {
  const state = passingState();
  verifyCampaignSourceEvidence(state);
  assert(state.errors.some((error) => error.includes('verified-social-memory-sources')));
  assert(state.errors.some((error) => error.includes('authority-check')));
}

function testCallerSuppliedAuthorityFlagsRejected() {
  const state = passingState();
  state.artifacts.set('authority.json', { kind: 'authority-check', arm: 'seed-authority', readBack: true,
    noProtectedMutations: true, permissionPolicyUnchanged: true, proposalsOnly: true });
  verifyCampaignSourceEvidence(state);
  assert(state.errors.some((error) => error.includes('Authority wrapper')));
}

testMissingSourceAndAuthorityFailsClosed();
testCallerSuppliedAuthorityFlagsRejected();
console.log('SocialWorld source and authority evidence gates reject missing artifacts and caller flags.');
