'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/epistemic/oracleScientificValidityService');

function validExecution(overrides = {}) {
  return {
    command: 'node verify.js',
    exitCode: 0,
    durationMs: 12,
    environmentHash: 'abc123',
    oracle: { id: 'oracle-1', version: '1.0.0', hash: 'a'.repeat(64), world: 'simulated', scope: 'auth' },
    ...overrides,
  };
}

function validReceipt(overrides = {}) {
  return {
    verifierDigest: 'verifier-a',
    checkedAt: new Date().toISOString(),
    executionEvidence: [validExecution()],
    ...overrides,
  };
}

async function main() {
  // Descriptor valide.
  const descriptor = service.validateOracleDescriptor(validExecution().oracle, { expectedWorld: 'simulated' });
  assert.equal(descriptor.valid, true);

  // Descriptor invalide : hash trop court.
  const badDescriptor = service.validateOracleDescriptor({ id: 'x', version: '1', hash: 'short' }, {});
  assert.equal(badDescriptor.valid, false);
  assert.ok(badDescriptor.errors.includes('oracle_hash_invalid'));

  // Reçu valide.
  const receipt = service.validateReceiptScientificValidity(validReceipt(), {
    trustedVerifierDigests: ['verifier-a'],
    minExecutions: 1,
  });
  assert.equal(receipt.valid, true);
  assert.equal(receipt.validExecutionCount, 1);

  // Reçu sans environnement ni oracle.
  const incomplete = service.validateReceiptScientificValidity(validReceipt({
    executionEvidence: [{ command: 'node verify.js', exitCode: 0, durationMs: 1 }],
  }), { trustedVerifierDigests: ['verifier-a'] });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.includes('execution_evidence_incomplete'));

  // Indépendance : deux vérificateurs distincts.
  const independence = service.assessOracleIndependence([
    validReceipt({ verifierDigest: 'verifier-a' }),
    validReceipt({ verifierDigest: 'verifier-b' }),
  ], { minDistinctVerifiers: 2, claimantDigest: 'claimant-x' });
  assert.equal(independence.independent, true);
  assert.equal(independence.distinctVerifierCount, 2);

  // Indépendance : vérificateur identique au claimant.
  const dependent = service.assessOracleIndependence([
    validReceipt({ verifierDigest: 'claimant-x' }),
  ], { claimantDigest: 'claimant-x' });
  assert.equal(dependent.independent, false);
  assert.ok(dependent.issues.includes('verifier_equals_claimant'));

  // Synthèse globale.
  const summary = service.summarizeValidity([
    validReceipt({ verifierDigest: 'verifier-a' }),
    validReceipt({ verifierDigest: 'verifier-b' }),
  ], { trustedVerifierDigests: ['verifier-a', 'verifier-b'], minDistinctVerifiers: 2 });
  assert.equal(summary.valid, true);
  assert.equal(summary.receiptCount, 2);

  console.log('Oracle scientific validity: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
