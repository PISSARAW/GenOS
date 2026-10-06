'use strict';

const schema = require('./trinityQualificationSchema');

function unqualified(validation) {
  return { status: 'candidate', accepted: false, candidateValid: false, coverage: null,
    coverageStatus: 'unverified', missionCoverage: null, missionVerified: false,
    requirements: [], reasons: validation.errors, promotionAuthorized: false };
}

function verify(contract, candidate, context) {
  try {
    const digest = schema.hash(candidate);
    const requirements = contract.requirements.map(item => checkRequirement({ contract, candidateHash: digest, item, context }));
    const accepted = requirements.every(item => item.status === 'verified');
    return { status: accepted ? 'accepted' : 'candidate', accepted, candidateValid: true, candidateHash: digest,
      contractHash: contract.hash, coverage: null, coverageStatus: 'unverified',
      verifiedRequirements: requirements.filter(item => item.status === 'verified').length,
      totalRequirements: requirements.length, missionCoverage: null,
      missionVerified: missionVerified(contract, accepted), scope: contract.scope,
      requirements, reasons: requirements.flatMap(item => item.reasons), promotionAuthorized: false };
  } catch (error) {
    return unqualified({ errors: [error.message] });
  }
}

function missionVerified(contract, accepted) {
  return accepted && contract.scope.kind === 'mission' && contract.requirements.every(item => item.scope !== 'fixture');
}

function checkRequirement(input) {
  const { item, contract, context } = input;
  const refs = contract.verificationRefs.filter(ref => item.verificationRefs.includes(ref.id));
  const receipts = Array.isArray(context.receipts) ? context.receipts : [];
  const findings = refs.map(ref => checkRef({ ...input, ref, receipts }));
  const verified = findings.every(finding => finding.verified);
  return { requirementId: item.id, status: verified ? 'verified' : 'unverified', scope: item.scope,
    reasons: findings.flatMap(finding => finding.reasons), verificationRefs: findings };
}

function checkRef(input) {
  const matches = input.receipts.filter(receipt => receipt?.verificationRefId === input.ref.id);
  if (matches.length !== 1) return finding(input.ref.id, 'missing_or_ambiguous_receipt');
  const receipt = matches[0];
  const failures = bindingFailures(receipt, input);
  if (failures.length) return { verificationRefId: input.ref.id, verified: false, reasons: failures };
  if (!authenticate(receipt, input.context)) return finding(input.ref.id, 'receipt_not_authenticated');
  return { verificationRefId: input.ref.id, verified: true, reasons: [] };
}

function finding(id, reason) {
  return { verificationRefId: id, verified: false, reasons: [reason] };
}

function bindingFailures(receipt, input) {
  const failures = [];
  if (receipt.status !== 'verified') failures.push('receipt_not_verified');
  if (receipt.contractHash !== input.contract.hash) failures.push('receipt_contract_mismatch');
  if (receipt.candidateHash !== input.candidateHash) failures.push('receipt_candidate_mismatch');
  if (receipt.verifierDigest !== input.ref.verifierDigest) failures.push('receipt_verifier_mismatch');
  if (receipt.verifierId !== input.ref.verifierId) failures.push('receipt_verifier_identity_mismatch');
  if (receipt.verifierVersion !== input.ref.verifierVersion) failures.push('receipt_verifier_version_mismatch');
  return failures.concat(independenceFailures(receipt, input.context), coverageFailures(receipt, input));
}

function independenceFailures(receipt, context) {
  const producer = context.producer;
  const verifier = receipt.independenceDescriptor;
  if (!producer?.actorId || !producer?.workspaceId) return ['producer_identity_missing'];
  if (!verifier?.actorId || !verifier?.workspaceId) return ['verifier_identity_missing'];
  if (receipt.independent !== true) return ['receipt_not_independent'];
  if (producer.actorId === verifier.actorId || producer.workspaceId === verifier.workspaceId) return ['receipt_identity_not_independent'];
  return [];
}

function coverageFailures(receipt, input) {
  if (!Array.isArray(receipt.requirementIds) || !receipt.requirementIds.includes(input.item.id)) return ['receipt_requirement_not_covered'];
  if (receipt.scope !== input.ref.scope) return ['receipt_scope_mismatch'];
  if (receipt.scope !== input.item.scope) return ['requirement_scope_not_verified'];
  if (!coversFixtures(receipt, input.ref)) return ['receipt_fixture_not_covered'];
  if (input.item.kind === 'proof' || input.item.scope === 'universal') return proofFailures(receipt);
  return [];
}

function coversFixtures(receipt, ref) {
  if (!ref.fixtureIds.length) return true;
  if (!Array.isArray(receipt.fixtureIds)) return false;
  return ref.fixtureIds.every(id => receipt.fixtureIds.includes(id));
}

function proofFailures(receipt) {
  if (receipt.method === 'formal_proof') return [];
  if (receipt.scope !== 'universal' && receipt.method === 'exhaustive_finite') return [];
  return ['trials_are_not_a_proof'];
}

function authenticate(receipt, context) {
  if (typeof context.verifyReceipt !== 'function') return false;
  try {
    return context.verifyReceipt(schema.freeze(schema.clone(receipt))) === true;
  } catch {
    return false;
  }
}

module.exports = { verify, unqualified };
