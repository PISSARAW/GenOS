'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { issueReceipt, validateReceipt } = require('../../src/services/epistemicVerifierReceiptService');

function assertSignedStatuses(policy, receipt) {
  const trustedVerifierDigests = [receipt.verifierDigest];
  const contract = { promotion: { require_independent_verification: true } };
  for (const status of ['verified', 'refuted', 'inconclusive']) {
    const signed = issueReceipt({ ...receipt, status });
    assert.equal(validateReceipt(signed, trustedVerifierDigests), true);
    const result = policy.evaluatePromotionGate(contract, {
      independentVerifierReceipt: signed, trustedVerifierDigests
    });
    assert.equal(result.eligible, status === 'verified', `Signed ${status} must respect its outcome`);
  }
  for (const invalidTrust of [receipt.verifierDigest, null, {}, new Set(trustedVerifierDigests)]) {
    assert.equal(validateReceipt(receipt, invalidTrust), false,
      'Only an explicit verifier trust list can authorize receipt validation');
  }
}

async function assertDurableNonce(policy, receipt) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const context = { independentVerifierReceipt: receipt };
  try {
    assert.equal(await policy.claimVerifierNonce(db, context), null);
    assert.equal((await policy.claimVerifierNonce(db, context)).policy, 'receipt_replay');
    const row = await db.get('SELECT COUNT(*) AS count FROM verifier_receipt_nonces');
    assert.equal(row.count, 1);
    await db.exec('PRAGMA query_only = ON');
    const fresh = { independentVerifierReceipt: issueReceipt({ ...receipt, nonce: 'readonly-fresh' }) };
    const blocked = await policy.applyPostPromotionPolicies(db, {
      promotion: { preserve_rejected_branches: true }
    }, { ...fresh, rejectedBranchIds: ['must-not-preserve'] });
    assert.equal(blocked.success, false, 'Read-only SQLite must block post-promotion effects');
    assert.deepEqual(blocked.actionsTaken, []);
    assert.match(blocked.error, /receipt_nonce_storage/);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM verifier_receipt_nonces')).count, 1);
    const unavailable = await policy.claimVerifierNonce(null, fresh);
    assert.equal(unavailable.policy, 'receipt_nonce_storage');
    const unacknowledged = await policy.claimVerifierNonce({ exec: async () => {}, run: async () => ({}) }, fresh);
    assert.equal(unacknowledged.policy, 'receipt_nonce_storage');
  } finally {
    await db.close();
  }
}

async function assertVerifierReceiptGates(policy) {
  const previousSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  try {
    process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-p0-general-receipt-only';
    const receipt = issueReceipt({
      resultId: 'p0-general-result', evidenceDigest: `sha256:${'a'.repeat(64)}`,
      verifierDigest: `sha256:${'b'.repeat(64)}`, independent: true
    });
    assertSignedStatuses(policy, receipt);
    await assertDurableNonce(policy, receipt);
  } finally {
    if (previousSecret === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = previousSecret;
  }
}

module.exports = { assertVerifierReceiptGates, assertSignedStatuses, assertDurableNonce };
