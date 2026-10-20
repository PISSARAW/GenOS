'use strict';

const { digest, verifyConstitution, touchesProtectedPath } = require('./constitution');

const ALLOWED_KINDS = new Set(['logic', 'scaffold']);

function invalid(message, code = 'GOVERNED_EVOLUTION_INVALID') {
  throw Object.assign(new Error(message), { code });
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (text) return text;
  return invalid(`${field} is required`);
}

function validateOperations(operations, constitution) {
  if (!Array.isArray(operations) || !operations.length) invalid('At least one proposed operation is required');
  const protectedChange = operations.find((operation) => touchesProtectedPath(operation, constitution));
  if (protectedChange) invalid(`Constitutional path cannot be changed: ${protectedChange.path}`, 'GOVERNED_EVOLUTION_CONSTITUTION_PROTECTED');
  return operations.map((operation) => ({
    path: requiredText(operation.path, 'operation.path'),
    action: requiredText(operation.action, 'operation.action')
  }));
}

function createChangeHypothesis(input) {
  if (!verifyConstitution(input.constitution)) {
    invalid('Constitution seal is missing or invalid', 'GOVERNED_EVOLUTION_CONSTITUTION_TAMPERED');
  }
  const kind = requiredText(input.kind, 'kind');
  if (!ALLOWED_KINDS.has(kind)) invalid(`Unsupported hypothesis kind: ${kind}`);
  const proposal = {
    kind,
    proposerId: requiredText(input.proposerId, 'proposerId'),
    parentRevision: requiredText(input.parentRevision, 'parentRevision'),
    candidateRevision: requiredText(input.candidateRevision, 'candidateRevision'),
    rollbackRef: requiredText(input.rollbackRef, 'rollbackRef'),
    claims: (input.claims || []).map((claim) => requiredText(claim, 'claim')),
    operations: validateOperations(input.operations, input.constitution),
    constitutionHash: input.constitution.constitutionHash
  };
  if (proposal.parentRevision === proposal.candidateRevision) invalid('Candidate must form a new lineage revision');
  if (!proposal.claims.length) invalid('At least one falsifiable claim is required');
  return Object.freeze({
    hypothesisId: `hyp-${digest(proposal).slice(0, 20)}`,
    status: 'HYPOTHESIS',
    promotionEligible: false,
    ...proposal
  });
}

module.exports = { createChangeHypothesis };
