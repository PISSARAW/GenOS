'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../../src/services/biologicalIntegrity');

async function qualify(db, input) {
  const registry = require('../../src/services/verifierTrustRegistry');
  const native = require('../../src/services/agow/nativeMissionOutcomeVerifier');
  const receipts = require('../../src/services/agow/nativeRefutationReceipts');
  const context = input.context;
  assert.equal((await native.verify(context)).metrics.realizedLoss, 1);
  await assert.rejects(native.verify({ ...context, eventIdentity: { ...context.eventIdentity, eventDigest: 'forged' } }), /terminal-mismatch/);
  await assert.rejects(native.verify({ ...context, binding: { ...context.binding,
    measurementContract: native.LEGACY_CONTRACT } }), /completed-run-required/);
  const trusted = registry.ensureVerifier('procedure_semantic').digest;
  const original = input.proof.saved.evaluation.assembly.verifications;
  const invalid = structuredClone(original);
  invalid[0].status = 'verified';
  assert.equal(require('../../src/services/epistemicVerifierReceiptService').validateReceipt(invalid[0], [trusted]), false);
  const variants = [invalid, [original[0]], [original[0], original[0]]];
  for (const verifications of variants) {
    const proof = structuredClone(input.proof);
    proof.saved.evaluation.assembly.verifications = verifications;
    assert.throws(() => receipts.check(proof, input.subject));
  }
  assert.ok(original.every((receipt) => receipt.status === 'refuted'));
  assert.equal(digest(original), digest(input.proof.saved.evaluation.assembly.verifications));
  const allowed = require('../../src/services/epistemic/nativeOracleProof');
  await assert.rejects(allowed.read(db, { ...input.proof.request,
    reference: { hash: input.proof.attestation.hash, eventId: input.proof.attestation.eventId } }), /ORACLE_ASSEMBLY_NOT_ACCEPTED/);
}

module.exports = { qualify };
