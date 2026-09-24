'use strict';

const assert = require('assert');
const { reviewSymbiontOutput } = require('../src/services/holobionte/immune/holobiontImmunePlane');

async function run() {
  const review = await reviewSymbiontOutput({
    symbiontId: 'untrusted-candidate', claim: 'Candidate claims its own result is safe.',
    riskScore: 0.95, selfVerified: true, resultHash: 'sha256:untrusted-result',
    evidenceRefs: ['result:untrusted']
  });
  assert.strictEqual(review.allowed, false);
  assert.strictEqual(review.blocked, true);
  assert.ok(review.blockReason);
  console.log('✅ Holobiont AEIS Immune Plane tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont AEIS Immune Plane tests failed:', error);
  process.exitCode = 1;
});
