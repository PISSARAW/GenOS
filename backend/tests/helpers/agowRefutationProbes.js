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
  await evidenceGate(db, context);
}

async function evidenceGate(db, context) {
  const runtime = require('../../src/services/missionProtocols/runtime');
  const input = { agentId: context.binding.agentId, event: context.event };
  await assert.rejects(runtime.guardEvent(db, input), /ORACLE_ASSEMBLY_NOT_ACCEPTED/);
  const receipt = await require('../../src/services/biologicalWorkerStore').receipt(db, context.binding.runId);
  const run = { id: context.binding.runId, status: 'blocked', guardrailReason: 'ORACLE_ASSEMBLY_NOT_ACCEPTED' };
  const variants = [{ run: { ...run, status: 'completed' }, halt: false, biologicalReceipt: receipt },
    { run: { ...run, guardrailReason: 'other' }, halt: true, biologicalReceipt: receipt },
    { run, halt: true, biologicalReceipt: { ...receipt, result: { ...receipt.result, verified: true } } }];
  for (const saved of variants) {
    await assert.rejects(runtime.recordEvent(db, { ...input, apply: async () => saved }),
      /MISSION_EVIDENCE_NATIVE_REJECTION_REQUIRED/);
  }
  assert.equal(await db.get('SELECT run_id FROM mission_protocol_evidence WHERE run_id=?', run.id), undefined);
}

module.exports = { qualify };
