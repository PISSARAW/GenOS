'use strict';

const assert = require('node:assert/strict');
const biocenose = require('../src/services/biocenoseService');

const events = [{ type: 'MEMBER_QUARANTINED', payload: { memberId: 'm1' } }];
assert.equal(biocenose.evaluateMemberTrust('m1', ['m1'], events).trusted, false);
assert.equal(biocenose.evaluateMemberTrust('m2', ['m1'], events).reason, 'NOT_AN_ACTIVE_MEMBER');
assert.deepEqual(biocenose.inspectMemberSignal({ confidence: 0.99, evidenceRefs: [] }).flags, ['HIGH_CONFIDENCE_WITHOUT_EVIDENCE']);

const filtered = biocenose.filterLocalEvidence([
  { evidenceRef: 'e1', status: 'VERIFIED' }, { evidenceRef: 'e2', status: 'UNKNOWN' }
]);
assert.deepEqual(filtered.accepted.map((item) => item.evidenceRef), ['e1']);
assert.equal(biocenose.selectBiocenoseVariant('delphi').disclosure, 'anonymous_rounds');
assert.throws(() => biocenose.selectBiocenoseVariant('unknown'), (error) => error.code === 'BIOCENOSE_VARIANT_UNKNOWN');

const review = biocenose.routeClaimReview({
  claim: { type: 'security' }, members: [{ memberId: 'm1', role: 'reviewer', expertise: ['security'] }],
  quarantinedMemberIds: ['m1']
});
assert.equal(review.unassigned, true);
process.stdout.write('Biocenose resilience checks: PASS\n');
