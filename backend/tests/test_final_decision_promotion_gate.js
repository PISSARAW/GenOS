'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-epistemic-secret';

const assert = require('node:assert');
const test = require('node:test');
const {
  evaluatePromotionGate,
  buildHostVetoViolation,
  buildQuorumViolation
} = require('../src/services/strategyPromotionPolicyService');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');

test('evaluatePromotionGate vetoes promotion unconditionally when negative evidence or refutations are present', () => {
  const contract = {
    promotion: {
      require_replay: false,
      require_independent_verification: false
    }
  };

  // 1. Direct negativeEvidence boolean
  const negativeContext = { negativeEvidence: true };
  const negativeResult = evaluatePromotionGate(contract, negativeContext);
  assert.strictEqual(negativeResult.eligible, false);
  assert.strictEqual(negativeResult.violations.some((v) => v.policy === 'host_refutation_veto'), true);

  // 2. Refuted verifier result
  const refutedResultContext = {
    verifierResults: [
      { resultId: 'vr-1', status: 'verified' },
      { resultId: 'vr-2', status: 'refuted' }
    ]
  };
  const refutedEval = evaluatePromotionGate(contract, refutedResultContext);
  assert.strictEqual(refutedEval.eligible, false);
  assert.strictEqual(refutedEval.violations.some((v) => v.policy === 'host_refutation_veto'), true);

  // 3. AEIS anyBlocked
  const blockedContext = {
    aeisEvaluation: {
      anyBlocked: true,
      allAccepted: false
    }
  };
  const blockedEval = evaluatePromotionGate(contract, blockedContext);
  assert.strictEqual(blockedEval.eligible, false);
  assert.strictEqual(blockedEval.violations.some((v) => v.policy === 'host_refutation_veto'), true);

  // 4. Holobionte immune refutation
  const holobionteContext = {
    aeisEvaluation: {
      anyBlocked: false,
      allAccepted: true,
      holobionteResults: [
        { immune: { verifierResults: { results: [{ resultId: 'h-1', status: 'refuted' }] } } }
      ]
    }
  };
  const holoEval = evaluatePromotionGate(contract, holobionteContext);
  assert.strictEqual(holoEval.eligible, false);
  assert.strictEqual(holoEval.violations.some((v) => v.policy === 'host_refutation_veto'), true);

  // 5. Direct refutations array
  const refutationsContext = {
    refutations: [{ claimId: 'claim-1', reason: 'counterexample found' }]
  };
  const refutationsEval = evaluatePromotionGate(contract, refutationsContext);
  assert.strictEqual(refutationsEval.eligible, false);
  assert.strictEqual(refutationsEval.violations.some((v) => v.policy === 'host_refutation_veto'), true);
});

test('evaluatePromotionGate enforces verifier quorum and rejects blind trust or duplicate verifiers', () => {
  const verifierA = 'sha256:' + 'a'.repeat(64);
  const verifierB = 'sha256:' + 'b'.repeat(64);

  const receipt1 = issueReceipt({
    resultId: 'res-1',
    evidenceDigest: 'sha256:' + '1'.repeat(64),
    verifierDigest: verifierA,
    independent: true,
    status: 'verified',
    checkedAt: new Date().toISOString(),
    nonce: 'nonce-1'
  });

  const receipt2 = issueReceipt({
    resultId: 'res-2',
    evidenceDigest: 'sha256:' + '2'.repeat(64),
    verifierDigest: verifierB,
    independent: true,
    status: 'verified',
    checkedAt: new Date().toISOString(),
    nonce: 'nonce-2'
  });

  const duplicateVerifierReceipt = issueReceipt({
    resultId: 'res-3',
    evidenceDigest: 'sha256:' + '3'.repeat(64),
    verifierDigest: verifierA, // Same as receipt1
    independent: true,
    status: 'verified',
    checkedAt: new Date().toISOString(),
    nonce: 'nonce-3'
  });

  const dependentReceipt = issueReceipt({
    resultId: 'res-4',
    evidenceDigest: 'sha256:' + '4'.repeat(64),
    verifierDigest: verifierB,
    independent: false, // Blind self-attestation
    status: 'verified',
    checkedAt: new Date().toISOString(),
    nonce: 'nonce-4'
  });

  const quorumContract = {
    promotion: {
      minimum_verifier_quorum: 2,
      epistemic_verifier_digests: [verifierA, verifierB]
    }
  };

  // A. Only 1 receipt when quorum is 2 -> rejected
  const singleReceiptContext = {
    independentVerifierReceipts: [receipt1]
  };
  const singleResult = evaluatePromotionGate(quorumContract, singleReceiptContext);
  assert.strictEqual(singleResult.eligible, false);
  assert.strictEqual(singleResult.violations.some((v) => v.policy === 'verifier_quorum_not_met'), true);

  // B. 2 receipts but from same verifier -> rejected (no quorum of distinct verifiers)
  const duplicateContext = {
    independentVerifierReceipts: [receipt1, duplicateVerifierReceipt]
  };
  const duplicateResult = evaluatePromotionGate(quorumContract, duplicateContext);
  assert.strictEqual(duplicateResult.eligible, false);
  assert.strictEqual(duplicateResult.violations.some((v) => v.policy === 'verifier_quorum_not_met'), true);

  // C. 2 receipts but one is dependent (not independent) -> rejected
  const dependentContext = {
    independentVerifierReceipts: [receipt1, dependentReceipt]
  };
  const dependentResult = evaluatePromotionGate(quorumContract, dependentContext);
  assert.strictEqual(dependentResult.eligible, false);
  assert.strictEqual(dependentResult.violations.some((v) => v.policy === 'verifier_quorum_not_met'), true);

  // D. 2 distinct independent receipts with valid nonces -> quorum satisfied!
  const validQuorumContext = {
    independentVerifierReceipts: [receipt1, receipt2]
  };
  const validResult = evaluatePromotionGate(quorumContract, validQuorumContext);
  assert.strictEqual(validResult.eligible, true);
  assert.strictEqual(validResult.violations.length, 0);
});

test('evaluatePromotionGate rejects replayed nonce across candidate receipts', () => {
  const verifierA = 'sha256:' + 'a'.repeat(64);
  const replayedReceipt = issueReceipt({
    resultId: 'res-replayed',
    evidenceDigest: 'sha256:' + '5'.repeat(64),
    verifierDigest: verifierA,
    independent: true,
    status: 'verified',
    checkedAt: new Date().toISOString(),
    nonce: 'consumed-nonce'
  });

  const contract = {
    promotion: {
      require_independent_verification: true,
      epistemic_verifier_digests: [verifierA]
    }
  };

  const context = {
    independentVerifierReceipt: replayedReceipt,
    seenVerifierNonces: new Set(['consumed-nonce'])
  };

  const result = evaluatePromotionGate(contract, context);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.violations.some((v) => v.policy === 'receipt_replay'), true);
});

test('applyPostPromotionPolicies durably claims verifier nonces in DB and refuses replay on subsequent calls', async () => {
  const { applyPostPromotionPolicies } = require('../src/services/strategyPromotionPolicyService');
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });

  const verifierA = 'sha256:' + 'a'.repeat(64);
  const receipt = issueReceipt({
    resultId: 'res-durable',
    evidenceDigest: 'sha256:' + '9'.repeat(64),
    verifierDigest: verifierA,
    independent: true,
    status: 'verified',
    checkedAt: new Date().toISOString(),
    nonce: 'durable-nonce-xyz'
  });

  const contract = { promotion: {} };
  const executionContext = { independentVerifierReceipt: receipt };

  // First claim should succeed
  const firstRes = await applyPostPromotionPolicies(db, contract, executionContext);
  assert.strictEqual(firstRes.success, true);

  // Second claim with the same nonce must be refused
  const replayRes = await applyPostPromotionPolicies(db, contract, executionContext);
  assert.strictEqual(replayRes.success, false);
  assert.match(replayRes.error, /receipt_replay: Verifier receipt nonce was already consumed/);

  await db.close();
});
