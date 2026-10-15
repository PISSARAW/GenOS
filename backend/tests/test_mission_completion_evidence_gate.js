'use strict';

const assert = require('node:assert/strict');
const { verifyEvidenceContract } = require('../src/services/ontogenesis/missionCompletion');

const rejected = verifyEvidenceContract({ requiresEvidenceBeforePromotion: true }, {
  context: { evidence: ['agent_completed'] }
});
assert.deepEqual(rejected, { allowed: false, reason: 'verifier-receipt-independant-requis' });

const accepted = verifyEvidenceContract({ requiresEvidenceBeforePromotion: true }, {
  context: { evidence: ['evidence_report'], flags: { verifierReceiptPresent: true } }
});
assert.equal(accepted, null);

const explicitlyWaived = verifyEvidenceContract({ requiresEvidenceBeforePromotion: false }, {
  context: { evidence: [] }
});
assert.equal(explicitlyWaived, null);
process.stdout.write('3 mission completion evidence gate assertions passed\n');
